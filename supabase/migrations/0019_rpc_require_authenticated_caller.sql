-- Security review: SECURITY DEFINER RPCs were executable by `anon`.
--
-- Most no-op for an unauthenticated caller because they key off auth.uid(),
-- and the admin_* ones raise on is_municipality_admin(). reserve_spot did
-- not: it sets reserved_by = auth.uid() (null for anon) and
-- reserved_until = now() + 5 minutes, and the WHERE clause accepts an
-- unreserved row. So anyone holding the public anon key could soft-lock an
-- active spot for five minutes, hiding it from every driver's nearby-spots
-- query. Repeated over known ids that is a denial of the app's core feature,
-- with no login at all.
create or replace function public.reserve_spot(p_spot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  -- A reservation belongs to somebody. Without a caller there is nobody to
  -- hold it, and setting reserved_until anyway just hides the spot.
  if auth.uid() is null then
    return false;
  end if;

  update public.parking_spots
  set reserved_by = auth.uid(), reserved_until = now() + interval '5 minutes'
  where id = p_spot_id
    and status = 'active'
    and (reserved_until is null or reserved_until < now() or reserved_by = auth.uid())
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;
