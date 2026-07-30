import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LAZY_UNPARK_DISTANCE_M = 500;

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Called on app resume/focus with the device's current position -- there is
// no background tracking (PWAs get killed in the background). If the user
// is still far from where they parked, assume they drove off without
// checking out and close the session silently, with 0 points.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  let body: CheckBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { lat, lng } = body;
  if ([lat, lng].some((n) => typeof n !== "number" || Number.isNaN(n))) {
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
