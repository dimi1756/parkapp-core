-- Premium's free trial moves from 15 days to 14 (a clean two weeks, and the
-- length the Plans page now advertises). The trial length is decided
-- server-side and only here: membership_expires_at is not client-writable
-- (see 0008_lockdown_profile_columns.sql), so a client can neither grant
-- itself a trial nor choose how long one lasts. Changing the number in the
-- UI without this migration would have made the pricing page lie.
--
-- Replaces the function body only; every guarantee of the original is kept,
-- including the `membership_tier = 'free'` guard that stops a trial from
-- being re-granted or extended by calling this repeatedly.

create or replace function public.redeem_trial_premium() returns void as $$
begin
  update public.profiles
    set membership_tier = 'premium',
        membership_expires_at = now() + interval '14 days'
    where id = auth.uid()
      and membership_tier = 'free';
end;
$$ language plpgsql security definer set search_path = public;

-- Existing trials are deliberately left alone: someone mid-trial keeps the
-- expiry they were given. Shortening a grant already made would be a worse
-- surprise than the one extra day costs.
