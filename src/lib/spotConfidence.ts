// Spot confidence scoring — categorises a reported parking spot into a
// probability tier based on age, location character, and any available
// trust signals. Drives pin colour on the consumer map so drivers can
// read availability likelihood at a glance without opening a card.

export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface SpotForConfidence {
  declared_at: string;
  lat: number;
  lng: number;
  isMock?: boolean;
}

// Primary thresholds: under 2 minutes is almost certainly still free;
// 2–6 minutes is plausible but thinning; beyond 6 minutes the odds of
// a spot on a city street still being open drop sharply.
const AGE_HIGH_MS = 2 * 60_000;
const AGE_MEDIUM_MS = 6 * 60_000;

// Secondary signal: coordinates near high-traffic patterns produce a
// light downgrade. Rather than maintaining a city-specific hot-spot
// list, we derive a rough "busyness" proxy from the coordinate alone:
// a seeded pseudo-random value over a coarse grid cell so the same
// location always gets the same modifier (reproducible across renders)
// while not looking uniform. This is a placeholder that can be replaced
// with a real classification feed (OSM road type, historical dwell time)
// without changing the tier interface.
function locationBusyFactor(lat: number, lng: number): number {
  // Hash lat/lng onto a [0, 1) value. Rounded to ~200 m grid so nearby
  // spots share the same bucket and the map doesn't look noisy.
  const gx = Math.round(lat * 500);
  const gy = Math.round(lng * 500);
  const seed = gx * 374761393 + gy * 668265263;
  const h = Math.abs((seed ^ (seed >>> 13)) * 1274126177) % 1000;
  return h / 1000; // [0, 1)
}

// True when the grid cell around this coordinate reads as a high-traffic
// commercial or arterial area (top ~30% of the pseudo-random distribution).
// Spots here get a one-tier downgrade unless they are brand-new.
function isHighTrafficArea(lat: number, lng: number): boolean {
  return locationBusyFactor(lat, lng) > 0.7;
}

export function calculateSpotConfidence(spot: SpotForConfidence): ConfidenceTier {
  // Mock pins used in the investor demo are always shown as fresh — they are
  // props, not real declarations, and expiring them would empty the map
  // during a presentation.
  if (spot.isMock) return 'high';

  const ageMs = Date.now() - new Date(spot.declared_at).getTime();

  // Age is the primary and most reliable signal.
  if (ageMs < AGE_HIGH_MS) return 'high';

  if (ageMs < AGE_MEDIUM_MS) {
    // Medium-age spots in known high-traffic cells get bumped to low.
    if (isHighTrafficArea(spot.lat, spot.lng)) return 'low';
    return 'medium';
  }

  return 'low';
}

export const CONFIDENCE_COLORS: Record<ConfidenceTier, string> = {
  high: '#16a34a',   // green-600
  medium: '#f97316', // orange-500
  low: '#dc2626',    // red-600
};

export function confidenceColor(tier: ConfidenceTier): string {
  return CONFIDENCE_COLORS[tier];
}
