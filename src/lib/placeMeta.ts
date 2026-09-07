// Sample metadata for search results -- ratings, review counts and opening
// hours.
//
// ---------------------------------------------------------------------------
// THIS IS SAMPLE DATA, NOT A PLACES BACKEND. Mapbox's Search Box API returns
// a name, an address, a category and a distance; it does not return ratings,
// review counts or opening hours, and ParkApp has no places provider behind
// it yet. Everything here is derived from the result's own id, so it shows
// the SHAPE of the richer result row the product is heading for without
// pretending to be sourced.
//
// Derived rather than random on purpose: a random rating would change on
// every keystroke of the same search, which reads as broken. The same place
// gets the same numbers for as long as Mapbox gives it the same id.
//
// The name, address and distance on those rows ARE real. Only the rating,
// review count and hours come from here.
// ---------------------------------------------------------------------------

/** Stable 32-bit hash of a string -- the single source of every value below. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** A different, still-stable number per (id, field), so rating and hours don't move together. */
function seeded(id: string, field: string, buckets: number): number {
  return hash(`${id}:${field}`) % buckets;
}

export interface PlaceRating {
  /** 3.6 - 4.9, one decimal. Below 3.6 reads as a warning the app can't back up. */
  rating: number;
  /** 12 - 511. */
  reviews: number;
}

export function placeRating(id: string): PlaceRating {
  return {
    rating: Math.round((3.6 + seeded(id, 'rating', 14) / 10) * 10) / 10,
    reviews: 12 + seeded(id, 'reviews', 500),
  };
}

export interface PlaceHours {
  open: boolean;
  /** 24h "HH:00". When open this is closing time; when closed, the next opening. */
  time: string;
}

/**
 * Sample opening hours. Opens 07:00-10:00, closes 17:00-23:00, both stable
 * per place; `now` is passed in rather than read here so this stays pure.
 */
export function placeHours(id: string, now: Date): PlaceHours {
  const opensHour = 7 + seeded(id, 'opens', 4); // 07:00 - 10:00
  const closesHour = 17 + seeded(id, 'closes', 7); // 17:00 - 23:00
  const hour = now.getHours();
  const open = hour >= opensHour && hour < closesHour;
  return {
    open,
    time: `${String(open ? closesHour : opensHour).padStart(2, '0')}:00`,
  };
}

/** "780 m" / "1.2 km" -- metres under a kilometre, one decimal above it. */
export function formatPlaceDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
