-- Chunk 1 (PARKAPP_MASTER_PLAN.md): profiles was broadly self-writable
-- under RLS with no column restriction (profiles_update_self,
-- 0001_init_schema.sql:224-226) -- any authenticated client could set
-- membership_tier / points_balance / trust_score / device_fingerprint to
-- whatever it wanted via a plain `supabase.from('profiles').update(...)`
-- call, e.g. free Premium for the asking. RLS governs which ROWS a client
-- can touch; this adds column-level REVOKE to also govern which COLUMNS,
-- leaving every other profile field (name, phone, vehicle details,
-- municipality assignment) exactly as self-editable as before.

revoke update (membership_tier, membership_expires_at, points_balance, trust_score, device_fingerprint)
  on public.profiles from authenticated;

-- points_balance / trust_score need no replacement write path: they only
-- ever move through the existing SECURITY DEFINER ledger triggers
-- (apply_points_transaction / apply_trust_event, 0001_init_schema.sql),
-- which run with the function owner's privileges regardless of the calling
-- role's own column grants -- this REVOKE doesn't affect them.

-- device_fingerprint: written exactly once, server-side, at signup -- read
-- from the signUp() metadata payload the same way full_name/phone already
-- are (see src/contexts/AuthContext.tsx signUp, src/lib/deviceFingerprint.ts).
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email, device_fingerprint)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    new.raw_user_meta_data ->> 'device_fingerprint'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- membership_tier / membership_expires_at: the only legitimate write path
-- is this RPC now, never a raw client UPDATE. Real payment verification is
-- separate, tracked work (PARKAPP_MASTER_PLAN.md, Chunk 3) -- this closes
-- the *forgery* vector (a client granting itself an arbitrary tier/expiry)
-- immediately, independent of when billing lands. Guarded to fire only
-- from 'free': calling it again while already premium is a no-op, so it
-- can't be used to keep resetting/extending a trial indefinitely.
create function public.redeem_trial_premium() returns void as $$
begin
  update public.profiles
    set membership_tier = 'premium',
        membership_expires_at = now() + interval '15 days'
    where id = auth.uid()
      and membership_tier = 'free';
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.redeem_trial_premium() to authenticated;
