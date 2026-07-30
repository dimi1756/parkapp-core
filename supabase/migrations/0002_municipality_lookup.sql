-- Adds a fast, server-side "nearest municipality" lookup for onboarding
-- geolocation auto-assignment (PRD section 1: Municipality Allocation).

alter table public.municipalities
  add column center_lat double precision not null default 0,
  add column center_lng double precision not null default 0;

alter table public.municipalities alter column center_lat drop default;
alter table public.municipalities alter column center_lng drop default;

-- Public RPC: given a device's coordinates, return the closest municipality
-- within max_km (default 50km). Runs the distance calculation in Postgres/PostGIS
-- so the client never has to parse geography WKB or do its own geo math.
create function public.nearest_municipality(
  user_lat double precision,
  user_lng double precision,
  max_km double precision default 50
)
returns table (
  id uuid,
  name text,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.name,
    st_distance(
      m.center_location,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
    ) / 1000.0 as distance_km
  from public.municipalities m
  where st_dwithin(
    m.center_location,
    st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
    max_km * 1000
  )
  order by distance_km asc
  limit 1;
$$;

grant execute on function public.nearest_municipality(double precision, double precision, double precision) to anon, authenticated;
