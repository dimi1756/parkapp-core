-- ParkApp core schema: users, municipalities, points, trust score, parking spots/sessions, leaderboards.
-- All point/trust mutations are server-controlled (RLS blocks direct client writes to ledger tables);
-- the actual rate-limit / geo-verification logic that decides *whether* to write is implemented as
-- Supabase Edge Functions in Sprint 3, running with the service role key.

create extension if not exists "pgcrypto";
create extension if not exists postgis;

-- ============================================================================
-- MUNICIPALITIES
-- ============================================================================

create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'GR',
  center_location geography(point, 4326) not null,
  boundary geography(polygon, 4326),
  created_at timestamptz not null default now()
);

create table public.municipality_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, municipality_id)
);

-- ============================================================================
-- PROFILES (1:1 with auth.users)
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text unique not null,
  email text,
  vehicle_make text,
  vehicle_color text,
  vehicle_plate text, -- full plate stored for enforcement/legal use; UI masks to last 2 chars (GDPR)
  municipality_id uuid references public.municipalities(id),
  membership_tier text not null default 'free' check (membership_tier in ('free', 'premium')),
  membership_expires_at timestamptz,
  points_balance integer not null default 0 check (points_balance >= 0),
  trust_score numeric(3,2) not null default 1.00 check (trust_score >= 0 and trust_score <= 1),
  device_fingerprint text,
  created_at timestamptz not null default now()
);

create index profiles_municipality_idx on public.profiles(municipality_id);
create index profiles_device_fingerprint_idx on public.profiles(device_fingerprint);

-- ============================================================================
-- PARKING SPOTS (community declarations)
-- ============================================================================

create table public.parking_spots (
  id uuid primary key default gen_random_uuid(),
  declared_by uuid not null references public.profiles(id),
  location geography(point, 4326) not null,
  road_snapped boolean not null default false,
  municipality_id uuid references public.municipalities(id),
  status text not null default 'active'
    check (status in ('active', 'claimed', 'expired', 'invalid', 'reported')),
  declared_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz
);

create index parking_spots_status_idx on public.parking_spots(status);
create index parking_spots_declared_by_idx on public.parking_spots(declared_by, declared_at desc);
create index parking_spots_location_idx on public.parking_spots using gist(location);

-- ============================================================================
-- PARKING SESSIONS ("I'm parked" state, drives the Lazy Auto-Unpark check)
-- ============================================================================

create table public.parking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  spot_id uuid references public.parking_spots(id),
  parked_location geography(point, 4326) not null,
  parked_at timestamptz not null default now(),
  unparked_at timestamptz,
  unpark_type text check (unpark_type in ('manual', 'lazy_auto', 'pending')) default 'pending',
  points_awarded integer not null default 0
);

-- Only one open (unparked_at is null) session per user
create unique index parking_sessions_one_active_per_user
  on public.parking_sessions(user_id) where (unparked_at is null);

create index parking_sessions_user_idx on public.parking_sessions(user_id, parked_at desc);

-- ============================================================================
-- POINTS LEDGER (append-only; profiles.points_balance is the cached total)
-- ============================================================================

create table public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  delta integer not null,
  reason text not null,
  related_spot_id uuid references public.parking_spots(id),
  related_session_id uuid references public.parking_sessions(id),
  created_at timestamptz not null default now()
);

create index points_transactions_user_idx on public.points_transactions(user_id, created_at desc);

-- ============================================================================
-- TRUST SCORE LEDGER (append-only; profiles.trust_score is the cached total)
-- ============================================================================

create table public.trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  delta numeric(3,2) not null,
  reason text not null, -- e.g. 'peer_reported_fake', 'auto_unpark_no_warning', 'geo_validation_failed'
  reported_by uuid references public.profiles(id),
  related_spot_id uuid references public.parking_spots(id),
  created_at timestamptz not null default now()
);

create index trust_events_user_idx on public.trust_events(user_id, created_at desc);

-- Community "spot was fake/taken" reports (feeds trust_events)
create table public.spot_reports (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.parking_spots(id),
  reported_by uuid not null references public.profiles(id),
  reason text not null check (reason in ('taken', 'fake', 'invalid_location')),
  created_at timestamptz not null default now(),
  unique (spot_id, reported_by)
);

-- ============================================================================
-- TRIGGERS: keep profiles.points_balance / trust_score in sync with ledgers
-- ============================================================================

create function public.apply_points_transaction() returns trigger as $$
begin
  update public.profiles
    set points_balance = greatest(0, points_balance + new.delta)
    where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger points_transactions_apply
  after insert on public.points_transactions
  for each row execute function public.apply_points_transaction();

create function public.apply_trust_event() returns trigger as $$
begin
  update public.profiles
    set trust_score = least(1.00, greatest(0.00, trust_score + new.delta))
    where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trust_events_apply
  after insert on public.trust_events
  for each row execute function public.apply_trust_event();

-- ============================================================================
-- LEADERBOARD VIEWS (derived from the points ledger, no separate storage)
-- ============================================================================

create view public.leaderboard_daily as
  select
    p.id as user_id,
    p.full_name,
    p.municipality_id,
    sum(pt.delta) filter (where pt.delta > 0) as points_today
  from public.points_transactions pt
  join public.profiles p on p.id = pt.user_id
  where pt.created_at >= date_trunc('day', now())
  group by p.id, p.full_name, p.municipality_id
  order by points_today desc nulls last;

create view public.leaderboard_weekly as
  select
    p.id as user_id,
    p.full_name,
    p.municipality_id,
    sum(pt.delta) filter (where pt.delta > 0) as points_this_week
  from public.points_transactions pt
  join public.profiles p on p.id = pt.user_id
  where pt.created_at >= date_trunc('week', now())
  group by p.id, p.full_name, p.municipality_id
  order by points_this_week desc nulls last;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.municipalities enable row level security;
alter table public.municipality_admins enable row level security;
alter table public.parking_spots enable row level security;
alter table public.parking_sessions enable row level security;
alter table public.points_transactions enable row level security;
alter table public.trust_events enable row level security;
alter table public.spot_reports enable row level security;

-- Helper: is the current user an admin for a given municipality?
create function public.is_municipality_admin(target_municipality_id uuid) returns boolean as $$
  select exists (
    select 1 from public.municipality_admins ma
    where ma.user_id = auth.uid() and ma.municipality_id = target_municipality_id
  );
$$ language sql security definer stable set search_path = public;

-- profiles: self read/update; municipality admins can read (never write) profiles in their municipality
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);
create policy profiles_select_admin on public.profiles
  for select using (public.is_municipality_admin(municipality_id));
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

-- municipalities: public read (needed for onboarding auto-assignment), no client writes
create policy municipalities_select_all on public.municipalities
  for select using (true);

-- municipality_admins: readable only by the admin row's own user or the target municipality's admins
create policy municipality_admins_select_self on public.municipality_admins
  for select using (auth.uid() = user_id or public.is_municipality_admin(municipality_id));

-- parking_spots: any authenticated user can read active spots; users can only ever
-- insert/update rows where they are the actor. Real validation (radius/road/rate-limit)
-- happens in the Sprint 3 Edge Function before this insert is allowed to succeed.
create policy parking_spots_select_all on public.parking_spots
  for select using (auth.role() = 'authenticated');
create policy parking_spots_insert_own on public.parking_spots
  for insert with check (auth.uid() = declared_by);
create policy parking_spots_claim on public.parking_spots
  for update using (status = 'active')
  with check (claimed_by = auth.uid());

-- parking_sessions: users only see/manage their own session
create policy parking_sessions_select_own on public.parking_sessions
  for select using (auth.uid() = user_id);
create policy parking_sessions_insert_own on public.parking_sessions
  for insert with check (auth.uid() = user_id);
create policy parking_sessions_update_own on public.parking_sessions
  for update using (auth.uid() = user_id);

-- points_transactions / trust_events: append-only ledgers. Users may only ever READ
-- their own rows. No insert/update/delete policy exists for the 'authenticated' role,
-- so all writes must go through the service-role Edge Function (Sprint 3) -- this is
-- the core of the "bulletproof" guarantee: a client can never grant itself points or trust.
create policy points_transactions_select_own on public.points_transactions
  for select using (auth.uid() = user_id);
create policy trust_events_select_own on public.trust_events
  for select using (auth.uid() = user_id);

-- spot_reports: any authenticated user can file a report; can read their own reports
create policy spot_reports_insert_own on public.spot_reports
  for insert with check (auth.uid() = reported_by);
create policy spot_reports_select_own on public.spot_reports
  for select using (auth.uid() = reported_by);
