-- Fix Supabase Security Advisor CRITICAL warnings: "Security Definer View".
--
-- Views created by the postgres role inherit that role's privileges at query
-- time (i.e. they effectively run as SECURITY DEFINER). Setting
-- security_invoker = true makes the view run with the *querying user's*
-- permissions instead, so RLS on the underlying tables is fully respected.
--
-- PostgreSQL 15 introduced the security_invoker view option; Supabase runs
-- PG 15+, so ALTER VIEW ... SET (security_invoker = true) is available.
--
-- Affected views (all three flagged CRITICAL by the Security Advisor):
--   public.leaderboard_daily    (defined in 0001_init_schema.sql)
--   public.leaderboard_weekly   (defined in 0001_init_schema.sql)
--   public.city_leaderboard     (defined in 0010_city_leaderboard.sql)
--
-- All three views query points_transactions + profiles which already have
-- per-row RLS policies restricting users to their own data. With
-- security_invoker the view enforces those policies for every caller rather
-- than bypassing them with creator-level access.

alter view public.leaderboard_daily  set (security_invoker = true);
alter view public.leaderboard_weekly set (security_invoker = true);
alter view public.city_leaderboard   set (security_invoker = true);

-- ============================================================================
-- spatial_ref_sys: RLS disabled (PostGIS system table)
-- ============================================================================
--
-- spatial_ref_sys is created by the PostGIS extension and lives in the public
-- schema. Its content is standard EPSG/SRID metadata (no user data), so a
-- permissive read-all policy is correct: we want every authenticated user to
-- be able to read it (needed internally by PostGIS geography operations), and
-- we want to satisfy the Security Advisor so the table no longer shows as an
-- RLS gap.
--
-- Direct client queries against spatial_ref_sys are never needed by app code,
-- but enabling RLS + a read-all policy is the least-surprise fix that removes
-- the warning without breaking PostGIS internals (extension functions run as
-- SECURITY DEFINER and bypass RLS anyway).

alter table public.spatial_ref_sys enable row level security;

create policy spatial_ref_sys_select_all on public.spatial_ref_sys
  for select using (true);
