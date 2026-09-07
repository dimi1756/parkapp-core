import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  KARYSTOS_CENTER,
  getMockDriverLeaderboard,
  getMockCityLeaderboard,
  MOCK_ADMIN_KPIS,
  getMockKarystosSpots,
  getMockWeeklyTrend,
  getMockAdminSpots,
  isMockSpotId,
  claimMockSpot,
  __resetClaimedMockSpots,
} from './demoMockData';

describe('getMockDriverLeaderboard', () => {
  it('is deterministic across repeated calls for the same period', () => {
    const a = getMockDriverLeaderboard('daily', undefined);
    const b = getMockDriverLeaderboard('daily', undefined);
    expect(a).toEqual(b);
  });

  it('returns entries sorted by points descending (excluding the injected current user)', () => {
    const entries = getMockDriverLeaderboard('weekly', undefined).filter((e) => !e.isCurrentUser);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].points).toBeGreaterThanOrEqual(entries[i].points);
    }
  });

  it('does not inject a "You" row when no currentUserId is given', () => {
    const entries = getMockDriverLeaderboard('daily', undefined);
    expect(entries.some((e) => e.isCurrentUser)).toBe(false);
  });

  it('injects exactly one current-user row when currentUserId is given', () => {
    const entries = getMockDriverLeaderboard('daily', 'user-123');
    const mine = entries.filter((e) => e.isCurrentUser);
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe('user-123');
    expect(mine[0].fullName).toBe('You');
  });

  it('produces different point ranges for daily vs weekly', () => {
    const daily = getMockDriverLeaderboard('daily', undefined);
    const weekly = getMockDriverLeaderboard('weekly', undefined);
    const maxDaily = Math.max(...daily.map((e) => e.points));
    const maxWeekly = Math.max(...weekly.map((e) => e.points));
    expect(maxWeekly).toBeGreaterThan(maxDaily);
  });

  it('never produces negative points', () => {
    for (const period of ['daily', 'weekly'] as const) {
      for (const entry of getMockDriverLeaderboard(period, 'me')) {
        expect(entry.points).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('getMockCityLeaderboard', () => {
  it('is deterministic across repeated calls', () => {
    expect(getMockCityLeaderboard()).toEqual(getMockCityLeaderboard());
  });

  it('marks exactly Karystos as the own city', () => {
    const entries = getMockCityLeaderboard();
    const own = entries.filter((e) => e.isOwnCity);
    expect(own).toHaveLength(1);
    expect(own[0].name).toBe('Karystos');
  });

  it('returns entries sorted by totalPoints descending', () => {
    const entries = getMockCityLeaderboard();
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].totalPoints).toBeGreaterThanOrEqual(entries[i].totalPoints);
    }
  });

  it('includes all configured cities exactly once', () => {
    const names = getMockCityLeaderboard().map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['Karystos', 'Chania', 'Rhodes', 'Chalkida', 'Athens', 'Thessaloniki']));
  });
});

describe('MOCK_ADMIN_KPIS', () => {
  it('has plausible non-negative values', () => {
    expect(MOCK_ADMIN_KPIS.active_drivers_24h).toBeGreaterThan(0);
    expect(MOCK_ADMIN_KPIS.spots_declared_today).toBeGreaterThan(0);
    expect(MOCK_ADMIN_KPIS.active_spots_now).toBeGreaterThanOrEqual(0);
    expect(MOCK_ADMIN_KPIS.avg_trust_score).toBeGreaterThanOrEqual(0);
    expect(MOCK_ADMIN_KPIS.avg_trust_score).toBeLessThanOrEqual(1);
  });
});

describe('getMockKarystosSpots', () => {
  const FIXED_NOW = new Date('2026-08-18T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('places every spot near the Karystos center', () => {
    for (const spot of getMockKarystosSpots()) {
      expect(Math.abs(spot.lng - KARYSTOS_CENTER[0])).toBeLessThan(0.01);
      expect(Math.abs(spot.lat - KARYSTOS_CENTER[1])).toBeLessThan(0.01);
    }
  });

  it('gives every spot status "active" and unique ids', () => {
    const spots = getMockKarystosSpots();
    expect(spots.every((s) => s.status === 'active')).toBe(true);
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
  });

  it('declares every spot in the past and expires every spot in the future, relative to "now"', () => {
    for (const spot of getMockKarystosSpots()) {
      expect(new Date(spot.declared_at).getTime()).toBeLessThan(FIXED_NOW.getTime());
      expect(new Date(spot.expires_at).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    }
  });
});

describe('getMockAdminSpots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cycles through active/active/claimed/reported statuses', () => {
    const spots = getMockAdminSpots();
    const expected = ['active', 'active', 'claimed', 'reported'];
    spots.forEach((s, i) => {
      expect(s.status).toBe(expected[i % 4]);
    });
  });

  it('reuses the same coordinates as getMockKarystosSpots', () => {
    const adminSpots = getMockAdminSpots();
    const driverSpots = getMockKarystosSpots();
    expect(adminSpots.map((s) => [s.lat, s.lng])).toEqual(driverSpots.map((s) => [s.lat, s.lng]));
  });
});

describe('getMockWeeklyTrend', () => {
  it('returns exactly 7 consecutive days ending today', () => {
    const trend = getMockWeeklyTrend();
    expect(trend).toHaveLength(7);
    const today = new Date().toISOString().slice(0, 10);
    expect(trend[trend.length - 1].day).toBe(today);
  });

  it('never produces negative declaration counts', () => {
    for (const day of getMockWeeklyTrend()) {
      expect(day.declarations).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces strictly increasing calendar dates', () => {
    const days = getMockWeeklyTrend().map((d) => new Date(d.day).getTime());
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]);
    }
  });
});

describe('mock spot claiming (demo happy path)', () => {
  beforeEach(() => {
    __resetClaimedMockSpots();
  });

  afterEach(() => {
    __resetClaimedMockSpots();
  });

  it('recognises every mock spot id, and nothing else', () => {
    for (const spot of getMockKarystosSpots()) {
      expect(isMockSpotId(spot.id)).toBe(true);
    }
    // Shaped like the real thing: a Postgres uuid from parking_spots.
    expect(isMockSpotId('0f6c2f9e-8f3a-4a1d-9c2b-1f6d4e5a7b3c')).toBe(false);
  });

  it('removes a claimed spot from the map, and leaves the rest alone', () => {
    const before = getMockKarystosSpots();
    const target = before[0];

    claimMockSpot(target.id);

    const after = getMockKarystosSpots();
    expect(after.map((s) => s.id)).not.toContain(target.id);
    expect(after).toHaveLength(before.length - 1);
  });

  it('does not bring a claimed spot back on the next read', () => {
    const target = getMockKarystosSpots()[0];
    claimMockSpot(target.id);
    expect(getMockKarystosSpots().map((s) => s.id)).not.toContain(target.id);
    expect(getMockKarystosSpots().map((s) => s.id)).not.toContain(target.id);
  });

  it('keeps the admin live map complete when a driver claims a spot', () => {
    const adminBefore = getMockAdminSpots();
    claimMockSpot(getMockKarystosSpots()[0].id);
    expect(getMockAdminSpots()).toEqual(adminBefore);
  });
});
