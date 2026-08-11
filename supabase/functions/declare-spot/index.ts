import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Anti-cheat parameters approved in Sprint 0 (adjusted: lazy auto-unpark
// instead of background tracking, 10-minute cooldown). Duplicated across
// each function file (rather than a shared import) so every function can be
// pasted and deployed standalone from the Supabase Dashboard.
const RULES = {
  DECLARE_RADIUS_M: 30,
  ROAD_SNAP_M: 15,
  MAX_GPS_ACCURACY_M: 20,
  HOURLY_CAP: 8,
  DAILY_CAP: 25,
  COOLDOWN_MINUTES: 10,
  TRUST_SHADOWBAN_THRESHOLD: 0.4,
};

// The shared YC-reviewer demo account is exempt from rate limiting only
// (hourly/daily caps + the declare-to-declare cooldown) so a live demo can
// click through many declarations back-to-back with zero rejections. GPS
// accuracy, the 30m radius check, road-snap, and trust/shadowban all still
// run for this account exactly as for any real user -- this is a UX carve-out
// for spam limits, not a bypass of location or identity verification.
const DEMO_EMAIL = "demo@parkapp.tech";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toEwkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * Confirms a point sits on/near an actual road via the Mapbox Map Matching
 * API. With no Mapbox token configured yet, the check is skipped (treated
 * as passed) rather than failing closed -- otherwise every declaration
 * would be rejected before a real token is ever added. Once
 * MAPBOX_SECRET_TOKEN is set, this becomes strict automatically: any API
 * error at that point does fail closed, since the check is then verifiable.
 */
async function isNearRoad(lat: number, lng: number): Promise<boolean> {
  const token = Deno.env.get("MAPBOX_SECRET_TOKEN") ?? Deno.env.get("VITE_MAPBOX_TOKEN");
  if (!token) return true;
  try {
    const coords = `${lng},${lat};${lng + 0.00001},${lat + 0.00001}`;
    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}?access_token=${token}&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    const matched = data?.matchings?.[0]?.geometry?.coordinates?.[0];
    if (!matched) return false;
    const [matchedLng, matchedLat] = matched;
    return haversineMeters(lat, lng, matchedLat, matchedLng) <= RULES.ROAD_SNAP_M;
  } catch {
    return false;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getRequestUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  return user;
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

/**
 * Defensive backstop for the handle_new_user trigger (migration 0003). It
 * covers every normal signup, but any user row created before that trigger
 * existed -- or through any other path that bypasses it -- is left with no
 * profiles row, and every parking_spots/parking_sessions insert for that
 * user then fails its FK with a generic, hard-to-diagnose 500. This closes
 * that gap unconditionally rather than relying on the trigger alone.
 */
async function ensureProfile(db: ReturnType<typeof getServiceClient>, user: { id: string; email?: string | null }) {
  const { data: existing } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) return;
  console.error(`[declare-spot] no profile for user ${user.id} -- creating a placeholder one`);
  await db.from("profiles").insert({
    id: user.id,
    full_name: "",
    phone: `pending-${user.id.slice(0, 8)}`,
    email: user.email ?? null,
  });
}

interface DeclareBody {
  spotLat: number;
  spotLng: number;
  userLat: number;
  userLng: number;
  accuracy: number;
  /** 'vacating' = "I'm leaving my own spot" (+10), 'spotted' = secondhand report (+5) */
  kind?: 'vacating' | 'spotted';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  let body: DeclareBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { spotLat, spotLng, userLat, userLng, accuracy, kind = 'vacating' } = body;
  if ([spotLat, spotLng, userLat, userLng, accuracy].some((n) => typeof n !== "number" || Number.isNaN(n))) {
    return json({ error: "Missing or invalid coordinates." }, 400);
  }

  const db = getServiceClient();
  await ensureProfile(db, user);
  const isDemoAccount = user.email === DEMO_EMAIL;

  if (accuracy > RULES.MAX_GPS_ACCURACY_M) {
    return json({ error: "GPS signal too weak to verify your location. Move to an open area and try again." }, 400);
  }

  if (!isDemoAccount) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourlyCount } = await db
      .from("parking_spots")
      .select("id", { count: "exact", head: true })
      .eq("declared_by", user.id)
      .gte("declared_at", oneHourAgo);

    if ((hourlyCount ?? 0) >= RULES.HOURLY_CAP) {
      return json({ error: `You've reached the hourly limit of ${RULES.HOURLY_CAP} declarations. Try again later.` }, 429);
    }

    const { count: dailyCount } = await db
      .from("parking_spots")
      .select("id", { count: "exact", head: true })
      .eq("declared_by", user.id)
      .gte("declared_at", oneDayAgo);

    if ((dailyCount ?? 0) >= RULES.DAILY_CAP) {
      return json({ error: `You've reached today's limit of ${RULES.DAILY_CAP} declarations.` }, 429);
    }

    const { data: lastSpot } = await db
      .from("parking_spots")
      .select("declared_at")
      .eq("declared_by", user.id)
      .order("declared_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSpot) {
      const minutesSince = (Date.now() - new Date(lastSpot.declared_at).getTime()) / 60000;
      if (minutesSince < RULES.COOLDOWN_MINUTES) {
        const wait = Math.ceil(RULES.COOLDOWN_MINUTES - minutesSince);
        return json({ error: `Please wait ${wait} more minute(s) before declaring another spot.` }, 429);
      }
    }
  }

  const distanceFromUser = haversineMeters(userLat, userLng, spotLat, spotLng);
  if (distanceFromUser > RULES.DECLARE_RADIUS_M) {
    return json({ error: "That spot is too far from your current location to declare." }, 400);
  }

  const onRoad = await isNearRoad(spotLat, spotLng);
  if (!onRoad) {
    return json({ error: "We couldn't verify that location is a real street. Declaration rejected." }, 400);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("trust_score, municipality_id")
    .eq("id", user.id)
    .single();

  const shadowHidden = (profile?.trust_score ?? 1) < RULES.TRUST_SHADOWBAN_THRESHOLD;

  const { data: spot, error: insertError } = await db
    .from("parking_spots")
    .insert({
      declared_by: user.id,
      location: toEwkt(spotLat, spotLng),
      road_snapped: true,
      municipality_id: profile?.municipality_id ?? null,
      status: "active",
      shadow_hidden: shadowHidden,
    })
    .select("id, status, declared_at, expires_at")
    .single();

  if (insertError || !spot) {
    console.error("[declare-spot] parking_spots insert failed:", insertError);
    return json(
      {
        error: "Could not save the spot. Please try again.",
        detail: insertError?.message ?? "insert returned no row",
        code: insertError?.code ?? null,
      },
      500
    );
  }

  let pointsAwarded = 0;
  if (!shadowHidden) {
    pointsAwarded = kind === 'spotted' ? 5 : 10;
    await db.from("points_transactions").insert({
      user_id: user.id,
      delta: pointsAwarded,
      reason: kind === 'spotted' ? "saw_free_spot" : "spot_declared",
      related_spot_id: spot.id,
    });
  }

  return json({ spot, pointsAwarded });
});
