-- Defensive Security & Hardening Audit (2026-08-18). Three findings, all
-- verified live against the production database before writing this file
-- (see PARKAPP_MASTER_PLAN.md's audit entry for the full methodology).

-- ============================================================================
-- FINDING 1 (CRITICAL): the column-level lockdown from 0008/0009 was never
-- actually effective on the live database. Querying live column grants
-- showed `authenticated` (and even `anon`) still holding UPDATE on
-- membership_tier, membership_expires_at, points_balance, trust_score,
-- device_fingerprint, and resident_verified -- i.e. any logged-in client
-- could self-grant Premium, forge trust_score to escape shadowban, credit
-- itself unlimited points, or fake resident_verified via a plain
-- `supabase.from('profiles').update(...)` call, completely bypassing every
-- RPC this app built for those transitions.
--
-- Root cause: a column-level REVOKE cannot override a broader table-level
-- GRANT UPDATE (Postgres privilege precedence) -- Supabase's default
-- `GRANT ALL ON ALL TABLES` already covers every column regardless of any
-- column-specific revoke layered on top. 0008/0009's `revoke update
-- (col1, col2, ...) ... from authenticated` ran without error but had zero
-- real effect for exactly this reason. The only correct fix is to revoke
-- the table-level UPDATE entirely and re-grant only the columns a client
-- should ever be able to write.
revoke update on public.profiles from authenticated, anon;

-- anon has no legitimate reason to update profiles at all (RLS requires
-- auth.uid() = id, which anon can never satisfy) -- no re-grant for anon.
grant update (full_name, phone, email, municipality_id, vehicle_make, vehicle_color, vehicle_plate)
  on public.profiles to authenticated;

-- ============================================================================
-- FINDING 2 (CRITICAL): parking_spots and parking_sessions had permissive
-- RLS policies letting `authenticated` INSERT/UPDATE them directly. The
-- edge functions (declare-spot, claim-spot, manual-unpark) already do all
-- their writes through the service-role key, which bypasses RLS entirely --
-- so these policies were never needed for the app to function; they were
-- pure attack surface. Confirmed via source review that no frontend code
-- writes to either table directly (only SELECT). Without these policies, a
-- client can still SELECT (unchanged) but every INSERT/UPDATE on these two
-- tables must go through an edge function, which is exactly where the
-- anti-cheat logic (GPS accuracy, road-snap, distance-from-user, hourly/
-- daily caps, cooldown, device-fingerprint scoping) actually lives.
--
-- Concretely, before this migration a client could:
--  - INSERT into parking_spots directly, bypassing road-snap/rate-limits/
--    GPS-accuracy entirely (declare-spot's whole anti-cheat pipeline).
--  - UPDATE parking_spots to claim any active spot from anywhere in the
--    world, bypassing claim-spot's distance check.
--  - INSERT into parking_sessions directly (any spot_id, no claim needed),
--    then call manual-unpark for an unlimited, zero-rate-limited +5-point
--    farm -- manual-unpark now also refuses to award the bonus for a
--    session whose unpark_type isn't 'pending' (supabase/functions/
--    manual-unpark/index.ts), so this closes the same gap from both sides.
drop policy if exists parking_spots_insert_own on public.parking_spots;
drop policy if exists parking_spots_claim on public.parking_spots;
drop policy if exists parking_sessions_insert_own on public.parking_sessions;
drop policy if exists parking_sessions_update_own on public.parking_sessions;

revoke insert, update on public.parking_spots from authenticated, anon;
revoke insert, update on public.parking_sessions from authenticated, anon;

-- Defense in depth on every other user-writable table this audit reviewed:
-- RLS already blocks DELETE/TRUNCATE on these (no policy = zero matching
-- rows), but revoking the blanket grants too means that stays true even if
-- RLS is ever accidentally disabled on one of them later.
revoke delete, truncate on
  public.profiles, public.parking_spots, public.parking_sessions,
  public.points_transactions, public.trust_events
  from authenticated, anon;

-- ============================================================================
-- FINDING 3 (HIGH, GDPR-relevant): squad_members' own SELECT policy compared
-- a subquery alias's squad_id to itself (`sm2.squad_id = sm2.squad_id`,
-- always true) instead of to the outer row's squad_id -- so any user who
-- belongs to at least one squad could read every row in squad_members for
-- every squad, not just their own: a full membership/social-graph
-- disclosure across the whole user base. friend_squads/squad_members are
-- dormant (unreferenced by any current app code, see Chunk 4's writeup) but
-- the table is live and RLS-enabled, so this was a real, currently
-- exploitable leak regardless of frontend usage. Fixing the policy rather
-- than dropping the table, since removing live schema is a separate,
-- product-level decision this audit doesn't make unprompted.
drop policy if exists "members can read their squad roster" on public.squad_members;
create policy "members can read their squad roster" on public.squad_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.squad_members sm2
      where sm2.squad_id = squad_members.squad_id
        and sm2.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Minor hardening (Area 4, input sanitization defense-in-depth): profiles
-- text columns had no length bound at the DB level, so a direct API call
-- (bypassing the client's own trim-only validation) could write an
-- arbitrarily large full_name/vehicle_plate/etc. Bounded to generous but
-- finite limits; ignores existing rows that predate this constraint.
alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 100) not valid,
  add constraint profiles_phone_length check (char_length(phone) <= 30) not valid,
  add constraint profiles_vehicle_make_length check (vehicle_make is null or char_length(vehicle_make) <= 50) not valid,
  add constraint profiles_vehicle_color_length check (vehicle_color is null or char_length(vehicle_color) <= 30) not valid,
  add constraint profiles_vehicle_plate_length check (vehicle_plate is null or char_length(vehicle_plate) <= 20) not valid;
