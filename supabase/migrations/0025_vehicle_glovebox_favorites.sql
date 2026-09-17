-- Digital Glovebox + Favorite Locations
-- Adds optional vehicle document expiry fields and a JSONB column for
-- saved navigation destinations to the profiles table.
-- All columns are nullable so existing rows are unaffected.

alter table public.profiles
  add column if not exists car_size               text,
  add column if not exists driving_license_expiry date,
  add column if not exists kteo_expiry            date,
  add column if not exists car_insurance_expiry   date,
  add column if not exists road_tax_expiry        date,
  add column if not exists favorite_locations     jsonb;

-- Force PostgREST to pick up the new columns immediately instead of
-- waiting for its next automatic schema-cache refresh.
NOTIFY pgrst, 'reload schema';
