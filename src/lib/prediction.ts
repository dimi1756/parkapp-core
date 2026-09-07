// Predictive routing: which nearby streets are worth trying when the
// destination itself has nothing free.
//
// ---------------------------------------------------------------------------
// THIS IS A HEURISTIC, NOT A TRAINED MODEL. There is no ML backend behind it
// and nothing here learns from history. It is a deterministic score computed
// in the browser from four things the app already knows -- how far a street
// is from the destination, how many spots have been reported near it
// recently, what time of day it is, and a fixed per-street offset -- and it
// exists to show the SHAPE of the predictive layer described in the investor
// material (Slide 3, "Predictive AI routing"), not to be that layer.
//
// The real thing is server-side: aggregate parking_spots by street and hour
// over months of declarations, and serve the resulting rates. That is
// deliberately still open work. Present this as a UI prototype of the model.
// Anyone demoing it should say so.
//
// The street names, distances and walk times ARE real -- they come from
// Mapbox reverse geocoding of actual points around the destination. Only the
// percentage is synthetic.
// ---------------------------------------------------------------------------

export interface PredictedStreet {
  /** Stable per-street id, so React keys and re-renders behave. */
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** 0-100. Synthetic -- see the note above. */
  probability: number;
  walkMinutes: number;
  distanceMeters: number;
}

const EARTH_RADIUS_M = 6_371_000;

function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Walking pace used across the app: roughly 80 m/min. */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

/**
 * Stable 0-1 value from a street name. Gives each street its own fixed
 * offset so the list doesn't reshuffle between renders, while still looking
 * varied -- the alternative, a random jitter, would make the same street
 * show a different number every time the card opened, which reads as broken.
 */
function nameOffset(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Points on a ring around the destination, to be reverse-geocoded into
 * street names. Spread evenly by bearing so the suggestions come from
 * different directions rather than three points down the same road.
 */
export function candidatePoints(
  destination: { lng: number; lat: number },
  count = 6,
  radiusMeters = 280
): { lng: number; lat: number }[] {
  const dLat = radiusMeters / 111_320;
  const dLng = dLat / Math.max(Math.cos((destination.lat * Math.PI) / 180), 0.01);

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI;
    return {
      lng: destination.lng + dLng * Math.cos(angle),
      lat: destination.lat + dLat * Math.sin(angle),
    };
  });
}

export interface PredictionContext {
  destination: { lng: number; lat: number };
  /** Live reported spots, used as a proxy for "this area gives up parking". */
  reportedSpots: { lng: number; lat: number }[];
  /** Local hour, 0-23. Passed in rather than read here so this stays pure and testable. */
  hour: number;
}

/**
 * Scores one candidate street. Every term is explainable out loud, which
 * matters more than sophistication for something being demonstrated:
 *
 * - Distance from the destination. Streets further out are emptier; that is
 *   the whole reason to send someone to a secondary road.
 * - Reported activity nearby. Spots declared close to a street mean drivers
 *   do turn over there.
 * - Time of day. Lunch and evening peaks make the centre harder.
 * - A fixed per-street offset, so the numbers vary between streets and never
 *   between renders of the same street.
 */
export function scoreStreet(
  street: { name: string; lng: number; lat: number },
  context: PredictionContext
): number {
  const distance = distanceMeters(street.lng, street.lat, context.destination.lng, context.destination.lat);

  // 0 at the destination, +14 by 400m out, flat after that.
  const distanceBonus = Math.min(14, (distance / 400) * 14);

  // Each spot reported within 250m adds confidence, up to +12.
  const nearbyReports = context.reportedSpots.filter(
    (spot) => distanceMeters(spot.lng, spot.lat, street.lng, street.lat) <= 250
  ).length;
  const activityBonus = Math.min(12, nearbyReports * 4);

  // Peak hours: lunch and the evening are when a town centre fills up.
  const isPeak = (context.hour >= 9 && context.hour <= 14) || (context.hour >= 18 && context.hour <= 21);
  const peakPenalty = isPeak ? 11 : 0;

  const offset = nameOffset(street.name) * 10 - 5;

  const score = 62 + distanceBonus + activityBonus - peakPenalty + offset;
  return Math.round(Math.min(93, Math.max(45, score)));
}

/**
 * Turns named candidate points into the ranked list the card renders.
 * Duplicate street names collapse to their closest point -- a ring around a
 * destination often hits the same road twice, and offering it twice looks
 * like a bug.
 */
export function buildPredictions(
  streets: { name: string; lng: number; lat: number }[],
  context: PredictionContext,
  limit = 3
): PredictedStreet[] {
  const byName = new Map<string, { name: string; lng: number; lat: number; distance: number }>();

  for (const street of streets) {
    if (!street.name.trim()) continue;
    const distance = distanceMeters(
      street.lng,
      street.lat,
      context.destination.lng,
      context.destination.lat
    );
    const existing = byName.get(street.name);
    if (!existing || distance < existing.distance) {
      byName.set(street.name, { ...street, distance });
    }
  }

  return Array.from(byName.values())
    .map((street) => ({
      id: street.name,
      name: street.name,
      lng: street.lng,
      lat: street.lat,
      probability: scoreStreet(street, context),
      distanceMeters: Math.round(street.distance),
      walkMinutes: walkMinutes(street.distance),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}
