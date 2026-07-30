-- Support tables/views/triggers for the Sprint 3 anti-spam engine.
-- Edge Functions (declare-spot, claim-spot, manual-unpark, check-lazy-unpark)
-- do the privileged writes; this migration adds the DB-level pieces that
-- don't need a server round trip: the shadowban filter and the peer-report
-- -> trust-score trigger.

-- Declarations from low-trust users are still recorded (audit trail, and
-- the user isn't told), but excluded from what other users see on the map.
alter table public.parking_spots
  add column shadow_hidden boolean not null default false;

-- Replace the old blanket "any authenticated user can read any spot" policy
-- with two narrower ones. This matters beyond REST reads: it's also what
-- Realtime enforces, so a shadow_hidden row never reaches another user's
-- browser in the first place -- filtering client-side after receipt would
-- still leak it via devtools.
drop policy if exists parking_spots_select_all on public.parking_spots;

create policy parking_spots_select_public on public.parking_spots
  for select using (status = 'active' and shadow_hidden = false and expires_at > now());

create policy parking_spots_select_own on public.parking_spots
  for select using (auth.uid() = declared_by or auth.uid() = claimed_by);

-- A peer "taken/fake" report is itself a trust signal against the original
-- declarer -- applied automatically, no Edge Function round trip needed.
create function public.apply_spot_report_trust_penalty() returns trigger as $$
declare
  declarer_id uuid;
begin
  select declared_by into declarer_id from public.parking_spots where id = new.spot_id;

  if declarer_id is not null and declarer_id != new.reported_by then
    insert into public.trust_events (user_id, delta, reason, reported_by, related_spot_id)
    values (declarer_id, -0.05, 'peer_reported_' || new.reason, new.reported_by, new.spot_id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger spot_reports_apply_trust
  after insert on public.spot_reports
  for each row execute function public.apply_spot_report_trust_penalty();

-- Server-side distance checks used by the claim-spot and check-lazy-unpark
-- Edge Functions. Keeping the geo math in PostGIS is both more accurate and
-- avoids parsing WKB geography values in application code.
create function public.spot_distance_meters(p_spot_id uuid, p_lat double precision, p_lng double precision)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  select st_distance(location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from public.parking_spots
  where id = p_spot_id;
$$;

create function public.session_distance_meters(p_session_id uuid, p_lat double precision, p_lng double precision)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  select st_distance(parked_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from public.parking_sessions
  where id = p_session_id;
$$;

grant execute on function public.spot_distance_meters(uuid, double precision, double precision) to authenticated, service_role;
grant execute on function public.session_distance_meters(uuid, double precision, double precision) to authenticated, service_role;

-- Redemptions (spending points in the Offers tab) are the one ledger write
-- a client is allowed to make directly -- safe because delta < 0 means a
-- user can only ever deduct from their own balance, never award themselves
-- points. Every positive-delta write still requires an Edge Function.
create policy points_transactions_insert_own_spend on public.points_transactions
  for insert with check (auth.uid() = user_id and delta < 0);

-- Lets the client subscribe to its own profile row (points_balance,
-- trust_score) and to nearby active spots, so the UI updates live the
-- instant an Edge Function writes -- RLS above ensures a subscriber only
-- ever receives rows it's allowed to see.
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.parking_spots;
