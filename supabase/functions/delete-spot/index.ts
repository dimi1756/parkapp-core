import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// See declare-spot/index.ts for why this is a secret rather than "*".
const APP_ORIGIN = Deno.env.get("APP_ORIGIN");
if (!APP_ORIGIN) {
  console.warn("[delete-spot] APP_ORIGIN is not configured -- CORS is wide open (Access-Control-Allow-Origin: *).");
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

// Lets a driver remove their own reported/declared spot pin from the map
// (the green "mine" pins) -- e.g. it was a mistake or the spot's already
// gone. Only ever expires a spot the caller declared themselves; RLS has
// insert/update/delete revoked on parking_spots entirely (0011_security_
// hardening.sql), so this service-role update is the only path.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await getRequestUser(req);
  if (!user) return json({ error: "Not authenticated." }, 401);

  let spotId: unknown;
  try {
    ({ spotId } = await req.json());
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (typeof spotId !== "string" || !spotId) {
    return json({ error: "spotId is required." }, 400);
  }

  const db = getServiceClient();

  const { data: spot } = await db
    .from("parking_spots")
    .select("id, declared_by, status")
    .eq("id", spotId)
    .maybeSingle();

  if (!spot || spot.declared_by !== user.id) {
    return json({ error: "Spot not found." }, 404);
  }
  if (spot.status !== "active") {
    return json({ error: "This spot can no longer be removed." }, 409);
  }

  const { error } = await db.from("parking_spots").update({ status: "expired" }).eq("id", spotId);
  if (error) return json({ error: "Failed to remove spot." }, 500);

  return json({ removed: true });
});
