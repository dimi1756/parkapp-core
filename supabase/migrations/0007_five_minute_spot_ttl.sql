-- Align the parking_spots TTL with the product requirement of a strict
-- 5-minute window (previously defaulted to 15 minutes in 0001_init_schema).
-- Additive/reversible: only changes the DEFAULT applied to new rows, does
-- not touch existing rows' expires_at values.

alter table public.parking_spots
  alter column expires_at set default (now() + interval '5 minutes');
