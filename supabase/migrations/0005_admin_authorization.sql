-- B2G Admin Panel: real, municipality-scoped data via SECURITY DEFINER RPCs
-- instead of opening RLS SELECT policies on every ledger/session table to
-- admins. Each function checks is_municipality_admin() itself, so the
-- authorization check lives in exactly one place per query, not scattered
-- across policy definitions.

create function public.admin_city_kpis(p_municipality_id uuid)
returns table (
  active_drivers_24h bigint,
  spots_declared_today bigint,
  active_spots_now bigint,
  avg_parking_minutes numeric,
  avg_trust_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_municipality_admin(p_municipality_id) then
    raise exception 'Not authorized for this municipality.';
  end if;

  return query
  select
    (select count(distinct pt.user_id)
       from points_transactions pt
       join profiles p on p.id = pt.user_id
      where p.municipality_id = p_municipality_id
        and pt.created_at >= now() - interval '24 hours'),
    (select count(*)
       from parking_spots
      where municipality_id = p_municipality_id
        and declared_at >= date_trunc('day', now())),
    (select count(*)
       from parking_spots
      where municipality_id = p_municipality_id
        and status = 'active'
        and expires_at > now()),
    (select round(avg(extract(epoch from (ps.unparked_at - ps.parked_at)) / 60)::numeric, 1)
       from parking_sessions ps
       join profiles p on p.id = ps.user_id
      where p.municipality_id = p_municipality_id
        and ps.unparked_at is not null
        and ps.parked_at >= now() - interval '7 days'),
    (select round(avg(trust_score)::numeric, 2)
       from profiles
      where municipality_id = p_municipality_id);
end;
$$;

grant execute on function public.admin_city_kpis(uuid) to authenticated;

create function public.admin_live_spots(p_municipality_id uuid)
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  status text,
  declared_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_municipality_admin(p_municipality_id) then
    raise exception 'Not authorized for this municipality.';
  end if;

  return query
  select
    ps.id,
    st_y(ps.location::geometry) as lat,
    st_x(ps.location::geometry) as lng,
    ps.status,
    ps.declared_at,
    ps.expires_at
  from parking_spots ps
  where ps.municipality_id = p_municipality_id
    and ps.declared_at >= now() - interval '24 hours'
  order by ps.declared_at desc;
end;
$$;

grant execute on function public.admin_live_spots(uuid) to authenticated;

create function public.admin_weekly_trend(p_municipality_id uuid)
returns table (
  day date,
  declarations bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_municipality_admin(p_municipality_id) then
    raise exception 'Not authorized for this municipality.';
  end if;

  return query
  select d::date, count(ps.id)
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d
  left join parking_spots ps
    on ps.municipality_id = p_municipality_id
   and date_trunc('day', ps.declared_at) = d
  group by d
  order by d;
end;
$$;

grant execute on function public.admin_weekly_trend(uuid) to authenticated;

-- Lets a logged-in user's client discover whether *they* administer a
-- municipality, and which one, without needing a separate RLS-gated
-- read on municipality_admins for every user.
create function public.my_admin_municipality()
returns table (municipality_id uuid, municipality_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, ma.role
  from municipality_admins ma
  join municipalities m on m.id = ma.municipality_id
  where ma.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.my_admin_municipality() to authenticated;
