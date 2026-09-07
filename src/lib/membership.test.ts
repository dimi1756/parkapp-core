import { describe, it, expect } from 'vitest';
import {
  getMembershipStatus,
  isPremiumActive,
  getDailySearchLimit,
  FREE_DAILY_SEARCHES,
  PREMIUM_DAILY_SEARCHES,
} from './membership';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getMembershipStatus', () => {
  it('returns free for a null profile', () => {
    expect(getMembershipStatus(null)).toEqual({ kind: 'free' });
  });

  it('returns free for an undefined profile', () => {
    expect(getMembershipStatus(undefined)).toEqual({ kind: 'free' });
  });

  it('returns free when membership_tier is not premium', () => {
    expect(
      getMembershipStatus({
        membership_tier: 'free',
        membership_expires_at: null,
        resident_verified: false,
      })
    ).toEqual({ kind: 'free' });
  });

  it('returns resident when resident_verified is true, regardless of expiry', () => {
    expect(
      getMembershipStatus({
        membership_tier: 'premium',
        membership_expires_at: new Date(Date.now() - DAY_MS).toISOString(),
        resident_verified: true,
      })
    ).toEqual({ kind: 'resident' });
  });

  it('returns trial with daysLeft=Infinity when premium with no expiry set', () => {
    const status = getMembershipStatus({
      membership_tier: 'premium',
      membership_expires_at: null,
      resident_verified: false,
    });
    expect(status.kind).toBe('trial');
    if (status.kind === 'trial') {
      expect(status.daysLeft).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('returns trial with the correct daysLeft when expiry is in the future', () => {
    const threeDaysFromNow = new Date(Date.now() + 3 * DAY_MS - 60_000).toISOString();
    const status = getMembershipStatus({
      membership_tier: 'premium',
      membership_expires_at: threeDaysFromNow,
      resident_verified: false,
    });
    expect(status.kind).toBe('trial');
    if (status.kind === 'trial') {
      expect(status.daysLeft).toBe(3);
    }
  });

  it('returns expired when the expiry timestamp is in the past', () => {
    const yesterday = new Date(Date.now() - DAY_MS).toISOString();
    expect(
      getMembershipStatus({
        membership_tier: 'premium',
        membership_expires_at: yesterday,
        resident_verified: false,
      })
    ).toEqual({ kind: 'expired' });
  });

  it('returns expired at the exact expiry instant', () => {
    const now = new Date().toISOString();
    expect(
      getMembershipStatus({
        membership_tier: 'premium',
        membership_expires_at: now,
        resident_verified: false,
      }).kind
    ).toBe('expired');
  });
});

describe('isPremiumActive', () => {
  it('is true for a trial member', () => {
    expect(
      isPremiumActive({
        membership_tier: 'premium',
        membership_expires_at: null,
        resident_verified: false,
      })
    ).toBe(true);
  });

  it('is true for a verified resident', () => {
    expect(
      isPremiumActive({
        membership_tier: 'premium',
        membership_expires_at: new Date(Date.now() - DAY_MS).toISOString(),
        resident_verified: true,
      })
    ).toBe(true);
  });

  it('is false for a free member', () => {
    expect(
      isPremiumActive({
        membership_tier: 'free',
        membership_expires_at: null,
        resident_verified: false,
      })
    ).toBe(false);
  });

  it('is false for an expired member', () => {
    expect(
      isPremiumActive({
        membership_tier: 'premium',
        membership_expires_at: new Date(Date.now() - DAY_MS).toISOString(),
        resident_verified: false,
      })
    ).toBe(false);
  });

  it('is false for a null profile', () => {
    expect(isPremiumActive(null)).toBe(false);
  });
});

describe('getDailySearchLimit', () => {
  it('gives the free allowance to a free account', () => {
    expect(
      getDailySearchLimit({ membership_tier: 'free', membership_expires_at: null, resident_verified: false })
    ).toBe(FREE_DAILY_SEARCHES);
  });

  it('gives the premium allowance during an active trial', () => {
    expect(
      getDailySearchLimit({
        membership_tier: 'premium',
        membership_expires_at: new Date(Date.now() + DAY_MS).toISOString(),
        resident_verified: false,
      })
    ).toBe(PREMIUM_DAILY_SEARCHES);
  });

  it('gives the premium allowance to a verified resident, who has no expiry', () => {
    expect(
      getDailySearchLimit({ membership_tier: 'premium', membership_expires_at: null, resident_verified: true })
    ).toBe(PREMIUM_DAILY_SEARCHES);
  });

  it('drops an expired trial back to the free allowance', () => {
    expect(
      getDailySearchLimit({
        membership_tier: 'premium',
        membership_expires_at: new Date(Date.now() - DAY_MS).toISOString(),
        resident_verified: false,
      })
    ).toBe(FREE_DAILY_SEARCHES);
  });

  it('treats a missing profile as free rather than throwing', () => {
    expect(getDailySearchLimit(null)).toBe(FREE_DAILY_SEARCHES);
  });

  it('is worth more than the free tier -- the paywall has to buy something', () => {
    expect(PREMIUM_DAILY_SEARCHES).toBeGreaterThan(FREE_DAILY_SEARCHES);
  });
});
