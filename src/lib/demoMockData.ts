// Investor-pitch mock data, injected ONLY for the shared demo/reviewer
// account (isDemoAccount, see AuthContext) -- a fresh pilot database looks
// sparse (a handful of real declarations at most), which reads as "is this
// thing actually used?" to a judge/investor sitting through a live demo.
// None of this ever reaches a real user's session.

import type { CityLeaderboardEntry } from '@/hooks/useCityLeaderboard';
import type { LeaderboardEntry } from '@/hooks/useLeaderboard';
import type { NearbySpot } from '@/hooks/useNearbySpots';
import type { CityKpis } from '@/components/admin/KPICards';
import type { LiveSpot } from '@/components/admin/CityMap';
import type { TrendDay } from '@/components/admin/WeeklyTrafficChart';
import type { MyReport } from '@/hooks/useMyReports';

// Karystos, southern Euboea -- the live demo takes place here. Scattered a
// few hundred meters apart around the waterfront/town center so they read
// as distinct real streets, not one pin duplicated four times.
export const DEMO_CENTER: [number, number] = [24.4167, 38.0167];

const MOCK_DRIVER_NAMES = [
  'Nikos Papadopoulos',
  'Eleni Konstantinou',
  'Giorgos Vasiliou',
  'Maria Antoniou',
  'Dimitris Michailidis',
  'Katerina Georgiou',
  'Yannis Stavrou',
  'Sofia Nikolaou',
];

/** Deterministic per-name-per-period so the numbers don't reshuffle on every render. */
function seededPoints(seed: number, base: number, spread: number): number {
  const x = Math.sin(seed) * 10000;
  return base + Math.floor((x - Math.floor(x)) * spread);
}

export function getMockDriverLeaderboard(period: 'daily' | 'weekly', currentUserId: string | undefined): LeaderboardEntry[] {
  const base = period === 'daily' ? 40 : 180;
  const spread = period === 'daily' ? 60 : 320;
  const entries = MOCK_DRIVER_NAMES.map((fullName, i) => ({
    userId: `demo-driver-${i}`,
    fullName,
    points: seededPoints(i + (period === 'weekly' ? 100 : 0), base, spread),
    isCurrentUser: false,
  })).sort((a, b) => b.points - a.points);

  // Insert the real demo account into the pack at a believable mid-table
  // rank rather than replacing anyone, so "Your rank" in the header still
  // resolves to a real position within this list.
  if (currentUserId) {
    const midPoints = entries[Math.floor(entries.length / 2)]?.points ?? base;
    entries.splice(Math.floor(entries.length / 2), 0, {
      userId: currentUserId,
      fullName: 'You',
      points: midPoints - 5,
      isCurrentUser: true,
    });
  }

  return entries;
}

const MOCK_CITIES: { name: string; base: number }[] = [
  { name: 'Karystos', base: 2840 },
  { name: 'Chania', base: 2410 },
  { name: 'Rhodes', base: 2190 },
  { name: 'Chalkida', base: 1560 },
  { name: 'Athens', base: 980 },
  { name: 'Thessaloniki', base: 720 },
];

export function getMockCityLeaderboard(): CityLeaderboardEntry[] {
  return MOCK_CITIES.map((c, i) => ({
    municipalityId: `demo-city-${i}`,
    name: c.name,
    totalPoints: c.base + seededPoints(i + 50, 0, 140),
    isOwnCity: c.name === 'Karystos',
  })).sort((a, b) => b.totalPoints - a.totalPoints);
}

export const MOCK_ADMIN_KPIS: CityKpis = {
  active_drivers_24h: 47,
  spots_declared_today: 128,
  active_spots_now: 9,
  avg_parking_minutes: 6.4,
  avg_trust_score: 0.94,
};

// Offsets in degrees (~40-120m at this latitude) so each pin lands on a
// visibly different nearby street rather than stacking on one point.
const DEMO_SPOT_OFFSETS: [number, number][] = [
  [0.0009, 0.0006],
  [-0.0012, 0.0004],
  [0.0004, -0.0011],
  [-0.0007, -0.0008],
];

/** Every mock spot id starts with this -- see isMockSpotId below. */
const MOCK_SPOT_ID_PREFIX = 'demo-spot-';

/**
 * True for the demo pins minted by getMockDemoSpots(). They render like
 * any real spot but have no parking_spots row behind them, so every code
 * path that would hit the server with a spot id (claim-spot, reserve_spot,
 * release_spot_reservation) must check this first and simulate instead.
 * Prefix-based rather than a lookup so it still answers correctly for a spot
 * that has already been removed from the live list.
 */
export function isMockSpotId(id: string): boolean {
  return id.startsWith(MOCK_SPOT_ID_PREFIX);
}

// Mock spots the demo account has already "claimed" this session. Without
// this, a claimed demo pin came straight back on the next refetch (the list
// is regenerated from scratch on every call), so the map kept offering a
// spot the reviewer had just parked in.
const claimedMockSpotIds = new Set<string>();

/** Marks a demo pin as taken so it disappears from the map, like a real claim. */
export function claimMockSpot(id: string): void {
  claimedMockSpotIds.add(id);
}

/** Test-only: puts every demo pin back on the map between test cases. */
export function __resetClaimedMockSpots(): void {
  claimedMockSpotIds.clear();
}

function buildMockSpots(): NearbySpot[] {
  const now = Date.now();
  return DEMO_SPOT_OFFSETS.map(([dLng, dLat], i) => ({
    id: `${MOCK_SPOT_ID_PREFIX}${i}`,
    declared_by: `demo-driver-${i}`,
    lng: DEMO_CENTER[0] + dLng,
    lat: DEMO_CENTER[1] + dLat,
    status: 'active' as const,
    // Staggered 1-6 minutes ago -- fresh enough to be real, varied enough
    // that "time since declared" on each pin's detail card isn't identical.
    declared_at: new Date(now - (60 + i * 90) * 1000).toISOString(),
    expires_at: new Date(now + (240 - i * 40) * 1000).toISOString(),
    // These ids/declared_by never correspond to a real parking_spots row --
    // isMock is what stops "Claim nearest spot" (and any other claim path)
    // from ever sending one to claim-spot, where it can only 409. The demo
    // account routes to and claims these locally instead (see MapTab).
    isMock: true,
  }));
}

/** Demo pins still on the map: everything except what's been claimed this session. */
export function getMockDemoSpots(): NearbySpot[] {
  return buildMockSpots().filter((spot) => !claimedMockSpotIds.has(spot.id));
}

export function getMockWeeklyTrend(): TrendDay[] {
  const dailyCounts = [22, 31, 27, 40, 53, 61, 44];
  const today = new Date();
  return dailyCounts.map((declarations, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (dailyCounts.length - 1 - i));
    return { day: day.toISOString().slice(0, 10), declarations };
  });
}

// Built from the unfiltered set on purpose: a spot the demo driver claimed
// on the consumer map is exactly the kind of thing a city dashboard should
// still show (as history), and the admin view has its own status cycle.
export function getMockAdminSpots(): LiveSpot[] {
  return buildMockSpots().map((s, i) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    status: (['active', 'active', 'claimed', 'reported'] as const)[i % 4],
    declared_at: s.declared_at,
    expires_at: s.expires_at,
  }));
}

// Karystos streets the demo pins sit on, paired with what each declaration
// earned: +10 for vacating a space you were in, +5 for reporting one you
// saw, matching declare-spot's own award. Street names are written out
// rather than reverse-geocoded so the demo history renders instantly and
// identically every time, with no Mapbox round trip to go wrong on stage.
const MOCK_REPORT_STREETS: [string, number, number, number][] = [
  ['Ακτή Καρύστου', 24.4171, 38.0159, 10],
  ['Οδός Σαχτούρη', 24.4198, 38.0182, 5],
  ['Πλατεία Αμαλίας', 24.4155, 38.0174, 10],
  ['Οδός Κριεζώτου', 24.4142, 38.0191, 10],
  ['Οδός Αιόλου', 24.4211, 38.0166, 5],
];

/**
 * Seeded declaration history for the demo account, newest first.
 *
 * Spread over the last few days rather than the last few minutes: the
 * section is meant to read as an ongoing contribution record, and five
 * entries all timestamped within one hour would read as a script that had
 * just been run. Times are derived from `now` so the list never goes stale.
 */
export function getMockMyReports(): MyReport[] {
  const now = Date.now();
  const HOURS_AGO = [3, 27, 30, 51, 76];
  return MOCK_REPORT_STREETS.map(([street, lng, lat, points], i) => ({
    id: `demo-report-${i}`,
    declaredAt: new Date(now - HOURS_AGO[i] * 60 * 60 * 1000).toISOString(),
    lng,
    lat,
    street,
    points,
  }));
}
