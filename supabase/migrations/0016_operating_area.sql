-- Operating area: the circle a municipality's pilot actually covers.
--
-- The app has been implicitly single-city, with the pilot's coordinates
-- written into the frontend. A second municipality could not be onboarded
-- without a code change, and a driver outside the covered area got the full
-- UI with nothing behind it. This makes the boundary data instead: an admin
-- drops a centre pin and sets a radius, drivers see the circle on their map,
-- and actions outside it are refused with an explanation.
--
-- It lives on `municipalities` rather than `municipality_settings` on
-- purpose. municipality_settings is admin-only by RLS (0006), and every
-- driver needs to read this to know whether they are inside the area at all.
-- municipalities is already world-readable to authenticated users, which is
-- exactly the audience.

alter table public.municipalities
  add column operating_center_lat double precision,
  add column operating_center_lng double precision,
  add column operating_radius_km numeric(6, 2)
    check (operating_radius_km is null or (operating_radius_km > 0 and operating_radius_km <= 100));

comment on column public.municipalities.operating_center_lat is
  'Centre of the covered area. Null means the pilot boundary has not been set; callers fall back to center_lat/center_lng.';
comment on column public.municipalities.operating_radius_km is
  'Radius of the covered area in kilometres. Null means unbounded -- no geofence is enforced.';

-- Reading stays open to any authenticated user (municipalities_select_all,
-- 0001_init_schema.sql). Writing is new, and scoped to that municipality's
-- own admins, matching municipality_settings and parking_zones.
--
-- The USING clause names the row's own id because is_municipality_admin()
-- takes the municipality id, which for this table is the primary key.
create policy municipalities_update_admin on public.municipalities
  for update using (public.is_municipality_admin(id))
  with check (public.is_municipality_admin(id));
