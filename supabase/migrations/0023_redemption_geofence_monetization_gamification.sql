-- Pillar 1: Merchant Redemptions (anti-double-dip)
-- Pillar 2: Geofence spot confirmation with reporter points
-- Pillar 3: Partner parking bookings
-- Pillar 4: Departure-declaration 2× multiplier

-- ============================================================================
-- PILLAR 1 — Coupon Redemptions
-- ============================================================================

-- coupon_redemptions is the canonical "this offer was used by this user" record.
-- The UNIQUE constraint on (user_id, coupon_id) is the DB-level double-dip guard.
-- The RPC below turns that constraint violation into a readable 400-style error
-- rather than letting it surface as a raw 409 to the client.
create table if not exists public.coupon_redemptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  coupon_id    text        not null,   -- ties to the frontend offer id (e.g. 'mikel_coffee_300')
  business     text        not null,
  points_spent integer     not null check (points_spent > 0),
  redeemed_at  timestamptz not null default now(),
  unique (user_id, coupon_id)
);

alter table public.coupon_redemptions enable row level security;
-- Users can only read their own records; inserts are exclusively through the RPC.
create policy coupon_redemptions_select_own on public.coupon_redemptions
  for select using (auth.uid() = user_id);

create index coupon_redemptions_user_idx
  on public.coupon_redemptions(user_id, redeemed_at desc);

-- redeem_coupon: atomic lock → check duplicate → check balance → write record → deduct points.
-- Raises a named exception rather than returning a flag so the caller can branch cleanly.
create or replace function public.redeem_coupon(
  p_coupon_id   text,
  p_business    text,
  p_points_cost integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Fast pre-check before acquiring the row lock
  if exists (
    select 1 from public.coupon_redemptions
    where user_id = auth.uid() and coupon_id = p_coupon_id
  ) then
    raise exception 'ALREADY_REDEEMED' using errcode = 'P0001';
  end if;

  -- Lock the profile row so two simultaneous swipes can't both pass the balance check
  select points_balance into v_balance
  from public.profiles where id = auth.uid()
  for update;

  if v_balance < p_points_cost then
    raise exception 'INSUFFICIENT_POINTS' using errcode = 'P0001';
  end if;

  -- The UNIQUE constraint is the true final guard against a race; the pre-check is just UX
  insert into public.coupon_redemptions(user_id, coupon_id, business, points_spent)
  values (auth.uid(), p_coupon_id, p_business, p_points_cost);

  -- Deduct via the ledger; the apply_points_transaction trigger updates profiles.points_balance
  insert into public.points_transactions(user_id, delta, reason)
  values (auth.uid(), -p_points_cost, 'redeemed_' || p_coupon_id);
end;
$$;

-- ============================================================================
-- PILLAR 2 — Geofence Spot Confirmation
-- ============================================================================

-- confirm_spot_arrival: seeker taps YES on the 15 m modal.
-- Awards points to the REPORTER (declared_by), not the seeker, and
-- applies the reporter's active 2× multiplier if present.
-- Marks the spot claimed by the seeker so it leaves the map.
create or replace function public.confirm_spot_arrival(
  p_spot_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_spot       public.parking_spots%rowtype;
  v_base_pts   integer := 50;
  v_multiplier numeric  := 1.0;
  v_final_pts  integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Lock the spot row; only 'active' spots may be confirmed
  select * into v_spot
  from public.parking_spots
  where id = p_spot_id and status = 'active'
  for update;

  if not found then
    raise exception 'SPOT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Read reporter's multiplier window
  select
    case
      when multiplier_active_until is not null and multiplier_active_until > now() then 2.0
      else 1.0
    end
  into v_multiplier
  from public.profiles where id = v_spot.declared_by;

  v_final_pts := floor(v_base_pts * v_multiplier)::integer;

  -- Mark spot claimed (removes it from the active map for everyone)
  update public.parking_spots
  set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
  where id = p_spot_id;

  -- Award to the REPORTER
  insert into public.points_transactions(user_id, delta, reason, related_spot_id)
  values (v_spot.declared_by, v_final_pts, 'spot_confirmed_by_seeker', p_spot_id);

  return jsonb_build_object(
    'points_awarded', v_final_pts,
    'multiplier',     v_multiplier,
    'reporter_id',    v_spot.declared_by
  );
end;
$$;

-- ============================================================================
-- PILLAR 3 — Partner Parking
-- ============================================================================

create table if not exists public.partner_parking (
  id                  uuid    primary key default gen_random_uuid(),
  name                text    not null,
  address             text,
  location            geography(point, 4326) not null,
  municipality_id     uuid    references public.municipalities(id),
  price_cents         integer not null default 500,   -- walk-in price
  partner_price_cents integer not null default 400,   -- ParkApp exclusive price
  available_spots     integer not null default 10,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create index partner_parking_location_idx on public.partner_parking using gist(location);
alter table public.partner_parking enable row level security;
create policy partner_parking_select_auth on public.partner_parking
  for select using (auth.role() = 'authenticated');

-- partner_bookings: one row per completed or pending payment.
-- Written exclusively by the Stripe webhook Edge Function (service role).
-- The trigger_context column records whether this was a pre-trip or
-- frustration upsell so conversion attribution is clean in analytics.
create table if not exists public.partner_bookings (
  id                        uuid        primary key default gen_random_uuid(),
  user_id                   uuid        not null references public.profiles(id),
  partner_id                uuid        not null references public.partner_parking(id),
  vehicle_plate             text        not null,
  amount_cents              integer     not null,
  status                    text        not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'expired')),
  stripe_payment_intent_id  text        unique,
  paid_at                   timestamptz,
  expires_at                timestamptz not null default (now() + interval '2 hours'),
  trigger_context           text        check (trigger_context in ('pre_trip', 'frustration')),
  created_at                timestamptz not null default now()
);

alter table public.partner_bookings enable row level security;
create policy partner_bookings_select_own on public.partner_bookings
  for select using (auth.uid() = user_id);

create index partner_bookings_user_idx    on public.partner_bookings(user_id, created_at desc);
create index partner_bookings_partner_idx on public.partner_bookings(partner_id, created_at desc);

-- ============================================================================
-- PILLAR 4 — Departure Multiplier
-- ============================================================================

-- multiplier_active_until: once set, confirm_spot_arrival applies 2× for 24 h.
-- Only the RPC writes this column; the lockdown policy blocks direct client updates.
alter table public.profiles
  add column if not exists multiplier_active_until timestamptz;

-- declare_departure: driver says "leaving in N minutes".
-- Opens a 24-hour multiplier window and awards a small bonus to nudge the habit.
create or replace function public.declare_departure(
  p_minutes_until_leaving integer default 15
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_minutes_until_leaving < 1 or p_minutes_until_leaving > 120 then
    raise exception 'INVALID_MINUTES' using errcode = 'P0001';
  end if;

  -- 24-hour window from now so seekers arriving hours later still reward the reporter
  v_until := now() + interval '24 hours';

  update public.profiles
  set multiplier_active_until = v_until
  where id = auth.uid();

  -- Small bonus for declaring; the big reward comes when a seeker confirms
  insert into public.points_transactions(user_id, delta, reason)
  values (auth.uid(), 10, 'departure_declared');

  return jsonb_build_object(
    'multiplier_active_until', v_until,
    'bonus_points', 10
  );
end;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

grant execute on function public.redeem_coupon(text, text, integer)  to authenticated;
grant execute on function public.confirm_spot_arrival(uuid)          to authenticated;
grant execute on function public.declare_departure(integer)          to authenticated;
