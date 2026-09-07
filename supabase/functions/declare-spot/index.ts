import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// CORS.
//
// The origin is reflected back, for any https page (plus localhost in dev),
// rather than matched against a configured allowlist.
//
// The allowlist version broke production twice. It knew about *.vercel.app
// and whatever APP_ORIGIN happened to hold, but the app is served from a
// custom domain -- parkapp.tech -- which matched neither, so the preflight
// came back naming an origin the browser was not on. The browser then
// refused to send the request at all, which surfaces in the app as
// supabase-js's "Failed to send a request to the Edge Function" while the
// logs show a healthy OPTIONS 204 and no POST behind it. Every new domain,
// preview URL or custom hostname would have reintroduced it.
//
// Reflecting is safe here because CORS is not what protects this function:
// verify_jwt is. CORS only decides which *page* may read the reply, and an
// attacker holding a stolen token does not need a browser to use it -- curl
// ignores CORS entirely. Pinning origins bought no real protection and cost
// two outages.
function isAllowedOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    return protocol === "https:";
  } catch {
    return false;
  }
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Cuts a preflight round trip off every declaration after the first.
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Rejects non-finite / out-of-range values that `typeof n === "number" &&
// !Number.isNaN(n)` alone lets through (Infinity/-Infinity are both valid
// numbers, and lat/lng have real-world bounds) -- a value like Infinity fed
// into the EWKT string below would produce a malformed geometry the DB
// insert would either reject with an opaque error or, worse, store.
function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

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

// The shared reviewer/demo account is exempt from three things, all so a
// live presentation can't be derailed by a rule aimed at farming or
// spoofing: rate limiting (hourly/daily caps + the declare-to-declare
// cooldown), the road-snap check, and the GPS accuracy gate. The last two
// are the same problem in different clothes -- a demo happens indoors,
// where Map Matching correctly says "not a street" and the phone reports
// 30-100m accuracy.
//
// The 30m declare radius and trust/shadowban still run for this account
// exactly as for any real user. The exemption keys off one specific known
// address on the verified JWT -- never a flag from the request body -- so no
// real user can ask for it.
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
 * API. Fails CLOSED (rejects the declaration) if MAPBOX_SECRET_TOKEN isn't
 * configured as a Supabase Edge Function secret -- this used to fail open
 * ("treated as passed") to allow bootstrapping before a token existed, but
 * that silently disabled the strongest anti-GPS-spoofing check in any
 * deployment that forgot to set the secret. Set it with:
 *   supabase secrets set MAPBOX_SECRET_TOKEN=<your Mapbox token>
 * (a Supabase Edge Function secret, separate from the client-side
 * VITE_MAPBOX_TOKEN in the frontend's own .env -- the two are not shared.)
 */
async function isNearRoad(lat: number, lng: number): Promise<boolean> {
  const token = Deno.env.get("MAPBOX_SECRET_TOKEN");
  if (!token) {
    console.error("[declare-spot] MAPBOX_SECRET_TOKEN is not configured -- road-snap check cannot run, failing closed.");
    return false;
  }
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

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Preflight: 204 with the headers above, which is what the browser
  // actually inspects before it will send the real request.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  let body: DeclareBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { spotLat, spotLng, userLat, userLng, accuracy, kind = 'vacating' } = body;
  if (
    !isValidLatLng(spotLat, spotLng) ||
    !isValidLatLng(userLat, userLng) ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  ) {
    return json({ error: "Missing or invalid coordinates." }, 400);
  }
  if (kind !== 'vacating' && kind !== 'spotted') {
    return json({ error: "Invalid declaration type." }, 400);
  }

  const db = getServiceClient();
  await ensureProfile(db, user);
  const isDemoAccount = user.email === DEMO_EMAIL;

  // Fetched once up front (rather than the old second fetch right before
  // the shadowban check further down) since the device_fingerprint is
  // needed for rate-limiting here too.
  const { data: profile } = await db
    .from("profiles")
    .select("trust_score, municipality_id, device_fingerprint")
    .eq("id", user.id)
    .single();

  // The accuracy gate joins the demo account's carve-out. Now that the demo
  // reads real GPS rather than a simulated position, an indoor presentation
  // reports 30-100m accuracy and every declaration would be rejected here -- the
  // same "the room is not a street" problem the road-snap bypass solves,
  // arriving one check earlier.
  if (!isDemoAccount && accuracy > RULES.MAX_GPS_ACCURACY_M) {
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

    // Same hourly/daily caps, but scoped to every account sharing this
    // browser's persisted device id (profiles.device_fingerprint, set once
    // at signup -- see 0008_lockdown_profile_columns.sql and
    // src/lib/deviceFingerprint.ts) rather than just this one account.
    // Blunts the trivial "make a second free account on the same phone to
    // reset the clock" farming pattern the per-user caps above don't catch
    // on their own. Read from the DB, never trusted from the request body,
    // since profiles.device_fingerprint is no longer client-writable.
    if (profile?.device_fingerprint) {
      const { data: sameDeviceProfiles } = await db
        .from("profiles")
        .select("id")
        .eq("device_fingerprint", profile.device_fingerprint);
      const deviceUserIds = (sameDeviceProfiles ?? []).map((p) => p.id);

      if (deviceUserIds.length > 1) {
        const { count: deviceHourlyCount } = await db
          .from("parking_spots")
          .select("id", { count: "exact", head: true })
          .in("declared_by", deviceUserIds)
          .gte("declared_at", oneHourAgo);

        if ((deviceHourlyCount ?? 0) >= RULES.HOURLY_CAP) {
          return json({ error: `You've reached the hourly limit of ${RULES.HOURLY_CAP} declarations. Try again later.` }, 429);
        }

        const { count: deviceDailyCount } = await db
          .from("parking_spots")
          .select("id", { count: "exact", head: true })
          .in("declared_by", deviceUserIds)
          .gte("declared_at", oneDayAgo);

        if ((deviceDailyCount ?? 0) >= RULES.DAILY_CAP) {
          return json({ error: `You've reached today's limit of ${RULES.DAILY_CAP} declarations.` }, 429);
        }
      }
    }
  }

  const distanceFromUser = haversineMeters(userLat, userLng, spotLat, spotLng);
  if (distanceFromUser > RULES.DECLARE_RADIUS_M) {
    return json({ error: "That spot is too far from your current location to declare." }, 400);
  }

  // Road-snap is skipped for the shared demo/reviewer account -- see the
  // DEMO_EMAIL note above. The declare radius and trust/shadowban still run.
  const onRoad = isDemoAccount || (await isNearRoad(spotLat, spotLng));
  if (!onRoad) {
    return json({ error: "We couldn't verify that location is a real street. Declaration rejected." }, 400);
  }

  const shadowHidden = (profile?.trust_score ?? 1) < RULES.TRUST_SHADOWBAN_THRESHOLD;

  const { data: spot, error: insertError } = await db
    .from("parking_spots")
    .insert({
      declared_by: user.id,
      location: toEwkt(spotLat, spotLng),
      road_snapped: !isDemoAccount,
      municipality_id: profile?.municipality_id ?? null,
      status: "active",
      shadow_hidden: shadowHidden,
    })
    .select("id, status, declared_at, expires_at")
    .single();

  if (insertError || !spot) {
    // Logged server-side only -- a raw Postgres error message/code returned
    // to the client can leak schema details (column/constraint/table names)
    // useful for probing the database. The client only needs to know it failed.
    console.error("[declare-spot] parking_spots insert failed:", insertError);
    return json({ error: "Could not save the spot. Please try again." }, 500);
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
