import type { Database } from '@/integrations/supabase/types';

type Profile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'membership_tier' | 'membership_expires_at' | 'resident_verified'
>;

export type MembershipStatus =
  | { kind: 'free' }
  | { kind: 'trial'; daysLeft: number }
  | { kind: 'resident' }
  | { kind: 'expired' };

/**
 * Single source of truth for "what tier is this account actually on right
 * now", derived only from server-written columns (membership_tier,
 * membership_expires_at, resident_verified -- all locked to SECURITY
 * DEFINER RPC writes, see 0008/0009_*.sql migrations). Nothing else in the
 * app should independently track plan/premium state client-side.
 *
 * `membership_tier` can lag reality for up to one session (an expired trial
 * self-heals back to 'free' via sync_expired_membership() on next profile
 * fetch, not instantly) -- this function accounts for that by checking the
 * expiry timestamp itself rather than trusting the cached tier alone.
 */
export function getMembershipStatus(profile: Profile | null | undefined): MembershipStatus {
  if (!profile || profile.membership_tier !== 'premium') return { kind: 'free' };
  if (profile.resident_verified) return { kind: 'resident' };

  if (!profile.membership_expires_at) {
    // Premium, not resident-verified, no expiry set -- shouldn't occur via
    // any current app flow (trial always sets an expiry, resident
    // verification always sets resident_verified), but treat it as an
    // active grant rather than silently downgrading a real account.
    return { kind: 'trial', daysLeft: Number.POSITIVE_INFINITY };
  }

  const msLeft = new Date(profile.membership_expires_at).getTime() - Date.now();
  if (msLeft <= 0) return { kind: 'expired' };
  return { kind: 'trial', daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)) };
}

/** True for both an active trial and a resident grant -- false for free or an expired trial. */
export function isPremiumActive(profile: Profile | null | undefined): boolean {
  const status = getMembershipStatus(profile);
  return status.kind === 'trial' || status.kind === 'resident';
}
