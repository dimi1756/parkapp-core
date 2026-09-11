-- Pre-launch audit (2026-09-08). Two findings, both live-database drift:
-- functions and grants that exist in production but in no migration file.

-- ============================================================================
-- FINDING 1 (HIGH): two SECURITY DEFINER functions, executable by `anon`,
-- left over from an earlier schema generation and referencing columns this
-- database does not have (`parking_spots.claim_expires_at`, and a
-- `status = 'available'` that parking_spots_status_check does not allow).
--
-- cleanup_expired_spots() is the dangerous one: its second CTE is
--   delete from public.parking_spots where expires_at < now()
-- i.e. anyone holding the public anon key could POST
-- /rest/v1/rpc/cleanup_expired_spots and delete rows. Today the statement
-- aborts on the missing column before the delete commits, so it is inert --
-- but it is one ALTER TABLE away from being a live delete endpoint, and
-- "currently broken" is not a security control.
--
-- release_claim(uuid) is the same vintage and equally unreferenced: no
-- frontend or Edge Function code calls either (verified by search across
-- src/ and supabase/functions/). The app's real equivalents are
-- manual-unpark, check-lazy-unpark and cancel_own_spot.
drop function if exists public.cleanup_expired_spots();
drop function if exists public.release_claim(uuid);

-- ============================================================================
-- FINDING 2 (MEDIUM, defense in depth): parking_zones and municipalities
-- still carry the blanket INSERT/UPDATE/DELETE/TRUNCATE grants Supabase
-- hands out by default -- to `anon` as well as `authenticated`.
--
-- RLS covers every path PostgREST actually exposes (zone writes require
-- is_municipality_admin, and municipalities has no DELETE policy at all), so
-- this is not currently exploitable. But TRUNCATE is not governed by RLS at
-- all, and 0011_security_hardening.sql already made exactly this argument
-- for the tables that existed then:
--
--   "revoking the blanket grants too means that stays true even if RLS is
--    ever accidentally disabled on one of them later."
--
-- parking_zones (0015) and municipalities (0016) landed after that audit and
-- never received the same treatment. This applies the project's own existing
-- standard to them.
--
-- The admin write paths keep working: they run as `authenticated` through
-- RLS, so only the grants that no legitimate flow uses are removed.
revoke insert, update, delete, truncate on public.parking_zones from anon;
revoke truncate on public.parking_zones from authenticated;

revoke insert, update, delete, truncate on public.municipalities from anon;
revoke insert, delete, truncate on public.municipalities from authenticated;

-- What `authenticated` deliberately keeps, and why:
--   parking_zones  INSERT/UPDATE/DELETE -- the admin zone drawing tool writes
--     and removes zones (src/hooks/useParkingZones.ts), each gated by
--     parking_zones_insert_admin / _update_admin / _delete_admin.
--   municipalities UPDATE -- an admin saves the operating area
--     (0016_operating_area.sql), gated by municipalities_update_admin.
-- Only TRUNCATE, which no policy can gate, is taken away from both.
