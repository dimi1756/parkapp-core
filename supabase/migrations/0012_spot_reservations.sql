-- Real-time spot locking: the "moment of truth" navigation flow (MapTab.tsx)
-- routes a driver toward a specific active spot well before they actually
-- claim it (claim-spot requires being within 30m, which by definition can't
-- be true yet mid-drive) -- without a lock, two drivers could both be routed
-- to the same spot and only find out one of them lost at arrival. status
-- can't represent this: parking_spots_status_check only allows
-- active/claimed/expired/invalid/reported, and 'reserved' would make the
-- spot vanish from the claimer's own client too, not just everyone else's.
-- A separate reserved_by/reserved_until pair keeps status='active' (so the
-- reserving driver still sees and can navigate to it) while excluding it
-- from every other driver's nearby-spots query below.
alter table public.parking_spots
  add column reserved_by uuid references public.profiles(id),
  add column reserved_until timestamptz;

comment on column public.parking_spots.reserved_by is
  'Set by reserve_spot() when a driver starts navigating to this spot. Self-expires via reserved_until -- there is no cleanup job, matching this project''s existing convention (see sync_expired_membership) of checking the timestamp at read/write time instead of running a background sweep.';
comment on column public.parking_spots.reserved_until is
  'Reservation expiry. NULL or in the past means unreserved, regardless of reserved_by''s value.';

-- Atomic claim-a-reservation: the WHERE clause is the concurrency control --
-- two simultaneous callers can both attempt this UPDATE, but Postgres row
-- locking means only the one whose WHERE clause still matches when it
-- acquires the row actually updates it, so exactly one caller ever wins a
-- given spot. SECURITY DEFINER so callers don't need direct UPDATE grants on
-- parking_spots (the existing RLS policies don't cover this column).
create or replace function public.reserve_spot(p_spot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  update public.parking_spots
  set reserved_by = auth.uid(), reserved_until = now() + interval '5 minutes'
  where id = p_spot_id
    and status = 'active'
    and (reserved_until is null or reserved_until < now() or reserved_by = auth.uid())
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

-- Frees a spot this driver reserved, e.g. after "No, it's taken" (moving on
-- to the next spot) or cancelling navigation -- lets it reappear for other
-- drivers immediately instead of waiting out the full 5-minute TTL. Silently
-- no-ops if the caller doesn't hold the reservation, so it's always safe to
-- call speculatively on cleanup paths.
create or replace function public.release_spot_reservation(p_spot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parking_spots
  set reserved_by = null, reserved_until = null
  where id = p_spot_id and reserved_by = auth.uid();
end;
$$;

grant execute on function public.reserve_spot(uuid) to authenticated;
grant execute on function public.release_spot_reservation(uuid) to authenticated;
