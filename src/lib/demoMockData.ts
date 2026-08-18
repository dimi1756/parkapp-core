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

// Karystos, southern Euboea -- the live demo takes place here. Scattered a
// few hundred meters apart around the waterfront/town center so they read
// as distinct real streets, not one pin duplicated four times.
export const KARYSTOS_CENTER: [number, number] = [24.4167, 38.0167];

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
const KARYSTOS_OFFSETS: [number, number][] = [
  [0.0009, 0.0006],
  [-0.0012, 0.0004],
  [0.0004, -0.0011],
  [-0.0007, -0.0008],
];

export function getMockKarystosSpots(): NearbySpot[] {
  const now = Date.now();
  return KARYSTOS_OFFSETS.map(([dLng, dLat], i) => ({
    id: `demo-spot-${i}`,
    declared_by: `demo-driver-${i}`,
    lng: KARYSTOS_CENTER[0] + dLng,
    lat: KARYSTOS_CENTER[1] + dLat,
    status: 'active' as const,
    // Staggered 1-6 minutes ago -- fresh enough to be real, varied enough
    // that "time since declared" on each pin's detail card isn't identical.
    declared_at: new Date(now - (60 + i * 90) * 1000).toISOString(),
    expires_at: new Date(now + (240 - i * 40) * 1000).toISOString(),
  }));
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

export function getMockAdminSpots(): LiveSpot[] {
  const now = Date.now();
  return getMockKarystosSpots().map((s, i) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    status: (['active', 'active', 'claimed', 'reported'] as const)[i % 4],
    declared_at: s.declared_at,
    expires_at: s.expires_at,
  }));
}
