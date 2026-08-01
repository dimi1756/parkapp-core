-- Real, persisted per-municipality admin settings (occupancy alert
-- thresholds + notification toggle), replacing the old static placeholder
-- Settings page. One row per municipality, created on first save.

create table public.municipality_settings (
  municipality_id uuid primary key references public.municipalities(id) on delete cascade,
  notify_high_occupancy boolean not null default true,
  moderate_spot_threshold integer not null default 5,
  full_spot_threshold integer not null default 15,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.municipality_settings enable row level security;

-- Only that municipality's own admins can read or write its settings.
create policy municipality_settings_select_admin on public.municipality_settings
  for select using (public.is_municipality_admin(municipality_id));
create policy municipality_settings_insert_admin on public.municipality_settings
  for insert with check (public.is_municipality_admin(municipality_id));
create policy municipality_settings_update_admin on public.municipality_settings
  for update using (public.is_municipality_admin(municipality_id))
  with check (public.is_municipality_admin(municipality_id));
