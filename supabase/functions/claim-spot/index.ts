import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// CORS -- see declare-spot/index.ts for the full reasoning. In short: the
// preflight response must name the method, and the origin is reflected from
// an allowlist so production, Vercel previews and localhost all work.
const APP_ORIGINS = (Deno.env.get("APP_ORIGIN") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (APP_ORIGINS.length === 0) {
  console.warn("[claim-spot] APP_ORIGIN is not configured -- only preview/localhost origins will be reflected.");
}

function isAllowedOrigin(origin: string): boolean {
  if (APP_ORIGINS.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    if (protocol !== "https:" && !isLocal) return false;
    return isLocal || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : APP_ORIGINS[0] ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const RULES = {
  CLAIM_RADIUS_M: 30,
  MAX_GPS_ACCURACY_M: 20,
  // Security audit (2026-08-18): this function had no rate limiting at all,
  // unlike declare-spot's hourly/daily caps -- a claim+manual-unpark loop
  // (claim a spot, immediately call manual-unpark for its +5pt bonus, repeat
  // on the next active spot) was an unlimited points-farming path with zero
  // caps. Same hourly/daily shape as declare-spot for consistency.
  HOURLY_CLAIM_CAP: 8,
  DAILY_CLAIM_CAP: 25,
};

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// See declare-spot/index.ts -- same demo-account rate-limit carve-out.
const DEMO_EMAIL = "demo@parkapp.tech";

function toEwkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
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

/** See declare-spot/index.ts for why this exists -- kept duplicated here on
 * purpose, matching this project's convention of standalone-deployable
 * function files. */
async function ensureProfile(db: ReturnType<typeof getServiceClient>, user: { id: string; email?: string | null }) {
  const { data: existing } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) return;
  console.error(`[claim-spot] no profile for user ${user.id} -- creating a placeholder one`);
  await db.from("profiles").insert({
    id: user.id,
    full_name: "",
    phone: `pending-${user.id.slice(0, 8)}`,
    email: user.email ?? null,
  });
}

interface ClaimBody {
  spotId: string;
  userLat: number;
  userLng: number;
  accuracy: number;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  let body: ClaimBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { spotId, userLat, userLng, accuracy } = body;
  if (
    typeof spotId !== "string" ||
    !spotId ||
    !isValidLatLng(userLat, userLng) ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  ) {
    return json({ error: "Missing or invalid input." }, 400);
  }

  const db = getServiceClient();
  await ensureProfile(db, user);
  const isDemoAccount = user.email === DEMO_EMAIL;

  // The accuracy gate joins the demo account's carve-out. Now that the demo
  // reads real GPS rather than a simulated position, an indoor presentation
  // reports 30-100m accuracy and every claim would be rejected here -- the
  // same "the room is not a street" problem the road-snap bypass solves,
  // arriving one check earlier.
  if (!isDemoAccount && accuracy > RULES.MAX_GPS_ACCURACY_M) {
    return json({ error: "GPS signal too weak to verify your location." }, 400);
  }

  const { data: existingSession } = await db
    .from("parking_sessions")
    .select("id")
    .eq("user_id", user.id)
    .is("unparked_at", null)
    .maybeSingle();

  if (existingSession) {
    return json({ error: "You already have an active parking session. Unpark first." }, 409);
  }

  if (!isDemoAccount) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourlyClaims } = await db
      .from("parking_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("parked_at", oneHourAgo);

    if ((hourlyClaims ?? 0) >= RULES.HOURLY_CLAIM_CAP) {
      return json({ error: `You've reached the hourly limit of ${RULES.HOURLY_CLAIM_CAP} claims. Try again later.` }, 429);
    }

    const { count: dailyClaims } = await db
      .from("parking_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("parked_at", oneDayAgo);

    if ((dailyClaims ?? 0) >= RULES.DAILY_CLAIM_CAP) {
      return json({ error: `You've reached today's limit of ${RULES.DAILY_CLAIM_CAP} claims.` }, 429);
    }
  }

  const { data: spot } = await db
    .from("parking_spots")
    .select("id, status, expires_at")
    .eq("id", spotId)
    .single();

  if (!spot || spot.status !== "active") {
    return json({ error: "This spot is no longer available." }, 409);
  }
  if (new Date(spot.expires_at).getTime() < Date.now()) {
    return json({ error: "This spot has expired." }, 409);
  }

  const { data: distance } = await db.rpc("spot_distance_meters", {
    p_spot_id: spotId,
    p_lat: userLat,
    p_lng: userLng,
  });

  if (typeof distance !== "number" || distance > RULES.CLAIM_RADIUS_M) {
    return json({ error: "You need to be near the spot to claim it." }, 400);
  }

  // .eq("status", "active") makes this UPDATE the actual double-booking
  // guard: if another driver's claim committed between our SELECT above and
  // here, this WHERE clause matches zero rows. Postgrest does NOT surface
  // that as an error -- updateError is null and data is just an empty array
  // -- so the row count has to be checked explicitly, or a losing racer
  // would fall through and get a false "claimed" success.
  const { data: claimedRows, error: updateError } = await db
    .from("parking_spots")
    .update({ status: "claimed", claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq("id", spotId)
    .eq("status", "active")
    .select("id");

  if (updateError) {
    console.error("[claim-spot] parking_spots claim update failed:", updateError);
    return json({ error: "Could not claim this spot. It may have just been taken." }, 409);
  }
  if (!claimedRows || claimedRows.length === 0) {
    return json({ error: "Someone just claimed this spot. Pick another one nearby." }, 409);
  }

  const { data: session, error: sessionError } = await db
    .from("parking_sessions")
    .insert({
      user_id: user.id,
      spot_id: spotId,
      parked_location: toEwkt(userLat, userLng),
      unpark_type: "pending",
    })
    .select("id, parked_at")
    .single();

  if (sessionError || !session) {
    console.error("[claim-spot] parking_sessions insert failed:", sessionError);
    return json({ error: "Spot claimed, but the session could not be started." }, 500);
  }

  return json({ session });
});
