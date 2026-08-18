import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// See declare-spot/index.ts for why this is a secret rather than "*".
const APP_ORIGIN = Deno.env.get("APP_ORIGIN");
if (!APP_ORIGIN) {
  console.warn("[manual-unpark] APP_ORIGIN is not configured -- CORS is wide open (Access-Control-Allow-Origin: *).");
}
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  Vary: "Origin",
};

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Rewards the user for properly confirming they've left, as opposed to the
// 0-point silent close performed by check-lazy-unpark.
const MANUAL_UNPARK_BONUS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  const db = getServiceClient();

  const { data: session } = await db
    .from("parking_sessions")
    .select("id, spot_id, unpark_type")
    .eq("user_id", user.id)
    .is("unparked_at", null)
    .maybeSingle();

  if (!session) {
    return json({ error: "No active parking session to close." }, 404);
  }
  // Defense in depth alongside the RLS lockdown on parking_sessions
  // (0011_security_hardening.sql): a session only reaches "pending" through
  // claim-spot's own distance/rate-limit checks, so this refuses to award
  // the bonus for any session that didn't actually go through that path.
  if (session.unpark_type !== "pending") {
    return json({ error: "This session cannot be closed this way." }, 409);
  }

  await db
    .from("parking_sessions")
    .update({ unparked_at: new Date().toISOString(), unpark_type: "manual", points_awarded: MANUAL_UNPARK_BONUS })
    .eq("id", session.id);

  if (session.spot_id) {
    await db.from("parking_spots").update({ status: "expired" }).eq("id", session.spot_id);
  }

  await db.from("points_transactions").insert({
    user_id: user.id,
    delta: MANUAL_UNPARK_BONUS,
    reason: "manual_unpark_bonus",
    related_session_id: session.id,
  });

  return json({ pointsAwarded: MANUAL_UNPARK_BONUS });
});
