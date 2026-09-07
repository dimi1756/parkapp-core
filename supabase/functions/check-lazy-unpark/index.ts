import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// CORS -- see declare-spot/index.ts for the full reasoning. In short: the
// preflight response must name the method, and the origin is reflected from
// an allowlist so production, Vercel previews and localhost all work.
const APP_ORIGINS = (Deno.env.get("APP_ORIGIN") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (APP_ORIGINS.length === 0) {
  console.warn("[check-lazy-unpark] APP_ORIGIN is not configured -- only preview/localhost origins will be reflected.");
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

const LAZY_UNPARK_DISTANCE_M = 500;

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

interface CheckBody {
  lat: number;
  lng: number;
}

// Called on app resume/focus with the device's current position -- there is
// no background tracking (PWAs get killed in the background). If the user
// is still far from where they parked, assume they drove off without
// checking out and close the session silently, with 0 points.
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

  let body: CheckBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { lat, lng } = body;
  if (!isValidLatLng(lat, lng)) {
    return json({ autoUnparked: false });
  }

  const db = getServiceClient();

  const { data: session } = await db
    .from("parking_sessions")
    .select("id, spot_id")
    .eq("user_id", user.id)
    .is("unparked_at", null)
    .maybeSingle();

  if (!session) return json({ autoUnparked: false });

  const { data: distance } = await db.rpc("session_distance_meters", {
    p_session_id: session.id,
    p_lat: lat,
    p_lng: lng,
  });

  if (typeof distance !== "number" || distance < LAZY_UNPARK_DISTANCE_M) {
    return json({ autoUnparked: false });
  }

  await db
    .from("parking_sessions")
    .update({ unparked_at: new Date().toISOString(), unpark_type: "lazy_auto", points_awarded: 0 })
    .eq("id", session.id);

  if (session.spot_id) {
    await db.from("parking_spots").update({ status: "expired" }).eq("id", session.spot_id);
  }

  await db.from("trust_events").insert({
    user_id: user.id,
    delta: -0.03,
    reason: "auto_unpark_no_warning",
    related_spot_id: session.spot_id,
  });

  return json({ autoUnparked: true });
});
