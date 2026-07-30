import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    .select("id, spot_id")
    .eq("user_id", user.id)
    .is("unparked_at", null)
    .maybeSingle();

  if (!session) {
    return json({ error: "No active parking session to close." }, 404);
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
