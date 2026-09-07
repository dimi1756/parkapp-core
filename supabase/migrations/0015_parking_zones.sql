-- Controlled / resident parking zones, owned by each municipality.
--
-- Until now the zones lived in a hardcoded array in src/lib/zones.ts, traced
-- by eye -- which is exactly why they sat off the actual streets. Moving
-- them here lets the municipality's own admins draw them on a map and save
-- them, which is both the honest source for this data and the thing that
-- makes the Zone Management screen a real tool instead of a mockup.
--
-- Geometry is stored as a GeoJSON LineString in jsonb rather than a PostGIS
-- geometry column, deliberately: the only consumers are the map (which wants
-- GeoJSON to render) and the client-side point-in-corridor test, neither of
-- which does spatial SQL. A jsonb column keeps the round trip lossless with
-- no ST_AsGeoJSON/parse step in between. If server-side spatial queries are
-- ever needed (enforcing the zone rule inside declare-spot, say), add a
-- generated geography column alongside rather than replacing this one.

create table public.parking_zones (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  name text not null,
  type text not null check (type in ('resident', 'controlled')),
  -- A GeoJSON LineString: {"type":"LineString","coordinates":[[lng,lat],...]}
  geojson_line jsonb not null,
  -- How far the rule reaches either side of the drawn axis. The line is what
  -- gets drawn; this is what makes it an area for the point-in-zone test.
  width_meters integer not null default 28 check (width_meters between 5 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  -- Rejects malformed geometry at write time rather than letting the map
  -- fail to render it later with no clue where the bad row came from.
  constraint parking_zones_geojson_is_linestring check (
    geojson_line ->> 'type' = 'LineString'
    and jsonb_typeof(geojson_line -> 'coordinates') = 'array'
    and jsonb_array_length(geojson_line -> 'coordinates') >= 2
  )
);

create index parking_zones_municipality_idx on public.parking_zones(municipality_id);

alter table public.parking_zones enable row level security;

-- Any signed-in driver may read every zone. Zones are public information --
-- a street sign is not a secret, and a driver arriving from another town
-- needs to see the zones of the town they are actually in, not just their
-- own municipality's.
create policy parking_zones_select_authenticated on public.parking_zones
  for select using (auth.role() = 'authenticated');

-- Writes are limited to that municipality's own admins, matching the
-- existing municipality_settings policies (0006_municipality_settings.sql).
create policy parking_zones_insert_admin on public.parking_zones
  for insert with check (public.is_municipality_admin(municipality_id));
create policy parking_zones_update_admin on public.parking_zones
  for update using (public.is_municipality_admin(municipality_id))
  with check (public.is_municipality_admin(municipality_id));
create policy parking_zones_delete_admin on public.parking_zones
  for delete using (public.is_municipality_admin(municipality_id));
