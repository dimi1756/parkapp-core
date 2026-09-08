// How long a declared spot stays on the map, and how it leaves.
//
// The database already gives every spot a 5-minute TTL
// (0007_five_minute_spot_ttl.sql) and RLS hides an expired one from other
// drivers. What it cannot do is make a pin disappear from a map that is
// already open: time passing is not a postgres_changes event, so nothing
// refetches, and the marker sat there until some unrelated write happened to
// trigger a reload. The driver's own pins had it worse -- they are visible
// at any age under parking_spots_select_own, so they accumulated on screen
// for the full 30 minutes useNearbySpots allowed.
//
// So expiry is enforced client-side too, on a clock rather than on an event.
// This module is the whole rule, kept pure so it can be tested without a map.

/**
 * How long a spot stays on the map after it was declared. Matches the
 * database TTL exactly -- a pin the app still shows after the server has
 * stopped serving it is a pin that sends a driver to nothing.
 */
export const SPOT_VISIBLE_TTL_MS = 5 * 60 * 1000;

/**
 * The tail of that lifetime spent fading out. The pin stays in the pin list
 * for these last seconds and animates to transparent, so it leaves the map
 * as a fade rather than a pop -- and, importantly, it is still React-owned
 * the whole time. Animating a marker *after* removing it would mean a DOM
 * node the component no longer tracks, which is exactly the kind of orphan
 * that makes Mapbox flicker on the next re-render.
 */
export const SPOT_FADE_OUT_MS = 5 * 1000;

/** How often the map re-checks the clock. Fine enough for a 5s fade to start on time. */
export const SPOT_SWEEP_INTERVAL_MS = 1000;

export type SpotPhase = 'visible' | 'fading' | 'gone';

interface SpotTimes {
  declared_at: string;
  /** The server's own TTL. Absent on an optimistic pin that has no row yet. */
  expires_at?: string | null;
}

/**
 * When this spot should leave the map, in epoch ms.
 *
 * expires_at is the server's answer and wins whenever it is present and
 * parseable. declared_at + TTL is the fallback for a pin painted
 * optimistically, before its row exists. An unparseable declared_at yields
 * NaN, which every comparison below treats as already gone -- a spot whose
 * age cannot be established is not one to keep showing.
 */
export function spotExpiryMs(spot: SpotTimes): number {
  if (spot.expires_at) {
    const parsed = new Date(spot.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return new Date(spot.declared_at).getTime() + SPOT_VISIBLE_TTL_MS;
}

/** Where this spot is in its life at `now`. */
export function spotPhase(spot: SpotTimes, now: number): SpotPhase {
  const expiry = spotExpiryMs(spot);
  if (!Number.isFinite(expiry) || now >= expiry) return 'gone';
  return expiry - now <= SPOT_FADE_OUT_MS ? 'fading' : 'visible';
}

/** Convenience for the map: is this spot still worth a marker at all? */
export function isSpotOnMap(spot: SpotTimes, now: number): boolean {
  return spotPhase(spot, now) !== 'gone';
}
