import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// CORS -- see declare-spot/index.ts for the full reasoning. In short: the
// preflight response must name the method, and the origin is reflected from
// an allowlist so production, Vercel previews and localhost all work.
const APP_ORIGINS = (Deno.env.get("APP_ORIGIN") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (APP_ORIGINS.length === 0) {
  console.warn("[manual-unpark] APP_ORIGIN is not configured -- only preview/localhost origins will be reflected.");
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

// Rewards the user for properly confirming they've left, as opposed to the
// 0-point silent close performed by check-lazy-unpark.
const MANUAL_UNPARK_BONUS = 5;

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
