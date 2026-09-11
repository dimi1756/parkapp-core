// Single, app-wide geolocation source.
//
// Previously every real GPS fix came from Mapbox's own GeolocateControl,
// which is created inside MapboxMap -- and MapboxMap is remounted from
// scratch on every tab switch (ConsumerApp renders the active pane with
// `key={activeTab}`). That meant a brand-new watch, a fresh permission
// round trip, and a camera re-lock onto the driver every single time they
// came back to the Map tab, undoing whatever they had panned to.
//
// This module owns one `watchPosition` for the whole session instead:
// permission is requested once, the watch keeps running across component
// remounts (module scope, deliberately never cleared), and the last fix is
// cached so a remount can render the user dot instantly instead of waiting
// on the first callback. Camera behaviour is decided by the caller, not by
// a control that centres the map as a side effect of receiving a fix.

export interface GeoFix {
  lng: number;
  lat: number;
  accuracy: number;
  /** Compass heading in degrees, or null when the device can't report one (most desktops). */
  heading: number | null;
}

type PositionListener = (fix: GeoFix) => void;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // A fix up to 5s old is fine to hand out immediately; anything older gets
  // re-acquired. Matches the one-shot options used before this module.
  maximumAge: 5000,
  timeout: 15000,
};

/**
 * What we know about location access right now.
 * - 'unknown': not asked yet this session, and the browser won't say
 * - 'prompt': the browser will ask on the next request
 * - 'granted' / 'denied': settled
 * - 'unavailable': no geolocation API at all
 */
export type LocationPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable';

type PermissionListener = (status: LocationPermission) => void;

let watchId: number | null = null;
let lastFix: GeoFix | null = null;
let permission: LocationPermission = 'unknown';
const listeners = new Set<PositionListener>();
const permissionListeners = new Set<PermissionListener>();

function setPermission(next: LocationPermission): void {
  if (permission === next) return;
  permission = next;
  permissionListeners.forEach((listener) => listener(next));
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/**
 * Reads the browser's own permission record, where available. This is the
 * only way to know an answer was already given -- "denied" in particular --
 * WITHOUT firing a request that silently does nothing. Also subscribes to
 * changes, so revoking access in site settings updates the UI without a
 * reload. Permissions API is unavailable on some Safari versions, where this
 * simply no-ops and the state stays 'unknown' until the first real request.
 */
function syncPermissionFromBrowser(): void {
  if (!isSupported()) {
    setPermission('unavailable');
    return;
  }
  if (typeof navigator.permissions?.query !== 'function') return;
  navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((status) => {
      setPermission(status.state as LocationPermission);
      status.onchange = () => setPermission(status.state as LocationPermission);
    })
    .catch(() => {
      // Some browsers reject the query for geolocation specifically -- the
      // first real request will settle it instead.
    });
}

syncPermissionFromBrowser();

/** Current location-permission state, as best the browser will tell us. */
export function getLocationPermission(): LocationPermission {
  return permission;
}

/** Subscribe to permission changes (including revocation from site settings). */
export function subscribeToPermission(listener: PermissionListener): () => void {
  permissionListeners.add(listener);
  listener(permission);
  return () => {
    permissionListeners.delete(listener);
  };
}

/**
 * Explicitly asks for location access, which is what actually shows the
 * browser's permission prompt. Resolves the settled state so a caller can
 * react immediately rather than waiting on a subscription.
 */
export async function requestLocationPermission(): Promise<LocationPermission> {
  if (!isSupported()) {
    setPermission('unavailable');
    return 'unavailable';
  }
  const fix = await requestFreshFix();
  return fix ? 'granted' : permission === 'denied' ? 'denied' : 'prompt';
}

function toFix(position: GeolocationPosition): GeoFix {
  const { longitude, latitude, accuracy, heading } = position.coords;
  return { lng: longitude, lat: latitude, accuracy, heading: heading ?? null };
}

/** Starts the session-long watch if it isn't already running. Idempotent. */
function ensureWatching(): void {
  if (watchId !== null || !isSupported()) return;
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      setPermission('granted');
      lastFix = toFix(position);
      listeners.forEach((listener) => listener(lastFix!));
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) setPermission('denied');
      console.warn('[geolocation] watch failed:', error.message);
    },
    WATCH_OPTIONS
  );
}

/**
 * Subscribe to live position updates. Starts the session watch on the first
 * subscriber (this is what triggers the one and only permission prompt) and
 * immediately replays the cached fix, if there is one, so a freshly mounted
 * map doesn't render without a user dot while waiting for the next tick.
 *
 * Unsubscribing detaches the listener but deliberately leaves the watch
 * running -- keeping the permission grant "warm" across tab switches is the
 * whole point of this module.
 */
export function subscribeToPosition(listener: PositionListener): () => void {
  listeners.add(listener);
  ensureWatching();
  if (lastFix) listener(lastFix);
  return () => {
    listeners.delete(listener);
  };
}

/** Most recent fix seen this session, or null if none has arrived yet. */
export function getLastFix(): GeoFix | null {
  return lastFix;
}

/** True once the user has explicitly refused location access. */
export function isLocationDenied(): boolean {
  return permission === 'denied';
}

/**
 * A guaranteed-fresh one-off fix, for the moments where "wherever the watch
 * last landed" isn't good enough -- declaring a spot, or starting a route
 * from exactly where the driver is standing right now. Resolves null (never
 * rejects) on any failure so callers can fall back to their last known
 * position. Also seeds the shared cache and starts the watch, so calling it
 * before any subscriber exists still only ever prompts once.
 */
export function requestFreshFix(): Promise<GeoFix | null> {
  if (!isSupported()) return Promise.resolve(null);
  ensureWatching();
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermission('granted');
        lastFix = toFix(position);
        listeners.forEach((listener) => listener(lastFix!));
        resolve(lastFix);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setPermission('denied');
        resolve(null);
      },
      WATCH_OPTIONS
    );
  });
}

/** Test-only: drops the watch and every cached value between test cases. */
export function __resetGeolocationForTests(): void {
  if (watchId !== null && isSupported()) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  lastFix = null;
  permission = 'unknown';
  listeners.clear();
  permissionListeners.clear();
}
