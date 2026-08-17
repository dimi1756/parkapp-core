-- Chunk 3 (PARKAPP_MASTER_PLAN.md): the "Citizen Verification" flow accepted
-- any non-empty string and then called the exact same trial RPC as "Start
-- Trial" -- there was no verification happening at all, and no persisted
-- record of which path a Premium account came through (both looked
-- identical after a reload; the "Verified Resident" badge itself lived only
-- in client-side React state, resetting to false on every reload no matter
-- what actually happened server-side).

alter table public.profiles
  add column resident_verified boolean not null default false;

-- Per-municipality resident code, set by that municipality's own admins
-- (existing municipality_settings RLS already scopes read/write to
-- is_municipality_admin()). Null until a municipality sets one.
alter table public.municipality_settings
  add column resident_code text;

-- resident_verified joins the other profile columns a client can never
-- write directly (see 0008_lockdown_profile_columns.sql) -- the only path
-- to true is the RPC below.
revoke update (resident_verified) on public.profiles from authenticated;

-- Distinct from redeem_trial_premium (0008): matches the caller's own
-- municipality's resident_code rather than granting a self-serve trial.
-- On match, Premium is permanent (membership_expires_at = null), not a
-- 15-day clock, since this represents an actual municipal benefit rather
-- than a promo. Returns a plain boolean (not an exception) so the client
-- can show a clean "wrong code" message without parsing a Postgres error.
create function public.redeem_resident_code(p_code text) returns boolean as $$
declare
  target_municipality_id uuid;
  expected_code text;
begin
  select municipality_id into target_municipality_id
    from public.profiles where id = auth.uid();

  if target_municipality_id is null then
    return false;
  end if;

  select resident_code into expected_code
    from public.municipality_settings where municipality_id = target_municipality_id;

  if expected_code is null or trim(lower(expected_code)) <> trim(lower(coalesce(p_code, ''))) then
    return false;
  end if;

  update public.profiles
    set membership_tier = 'premium',
        membership_expires_at = null,
        resident_verified = true
    where id = auth.uid();

  return true;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.redeem_resident_code(text) to authenticated;

-- No cron/scheduled-function infrastructure exists yet, so an expired trial
-- doesn't downgrade itself in the background -- instead this self-heals on
-- next check-in (called from AuthContext.fetchProfile on every session
-- load/refresh). Never touches a resident-verified row (permanent, no
-- expiry) or a still-active trial. This is the RPC-based, timestamp-driven
-- enforcement the plan called for, without needing pg_cron for a pilot.
create function public.sync_expired_membership() returns void as $$
begin
  update public.profiles
    set membership_tier = 'free'
    where id = auth.uid()
      and membership_tier = 'premium'
      and resident_verified = false
      and membership_expires_at is not null
      and membership_expires_at < now();
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.sync_expired_membership() to authenticated;
