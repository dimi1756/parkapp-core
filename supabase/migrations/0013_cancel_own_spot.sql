-- Lets a driver remove their own still-active declared spot from the map
-- (the green "X" badge on their own pins in MapTab.tsx) without waiting out
-- its 5-minute TTL. Mirrors 0012_spot_reservations.sql's pattern: no UPDATE
-- RLS policy exists on parking_spots at all (every write goes through a
-- SECURITY DEFINER function, same as declare-spot/claim-spot), so this is a
-- narrow RPC rather than a client-side UPDATE.
create or replace function public.cancel_own_spot(p_spot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  update public.parking_spots
  set status = 'invalid'
  where id = p_spot_id
    and declared_by = auth.uid()
    and status = 'active'
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

grant execute on function public.cancel_own_spot(uuid) to authenticated;
