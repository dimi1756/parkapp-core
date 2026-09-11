import { useCallback, useEffect, useRef, useState } from 'react';

const EARTH_RADIUS_M = 6_371_000;

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceTarget {
  spotId: string;
  lat: number;
  lng: number;
}

interface UseGeofenceWatcherOptions {
  /** Set to null to stop watching. */
  target: GeofenceTarget | null;
  radiusMeters?: number;
  /** Fired once when the user enters the radius. Cleared when target changes. */
  onEnter: (spotId: string) => void;
}

interface GeofenceState {
  /** Current distance to target in metres, null if no fix yet. */
  distanceMeters: number | null;
  /** Whether the Geolocation API is available on this device. */
  supported: boolean;
  /** Stop the watcher early (e.g. user dismissed the modal). */
  stop: () => void;
}

export function useGeofenceWatcher({
  target,
  radiusMeters = 15,
  onEnter,
}: UseGeofenceWatcherOptions): GeofenceState {
  const watchIdRef = useRef<number | null>(null);
  // Prevents the modal firing again if the user re-enters the radius after dismissing.
  const firedRef   = useRef(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!target || !supported) {
      setDistanceMeters(null);
      return;
    }

    firedRef.current = false;
    setDistanceMeters(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const dist = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          target.lat,
          target.lng,
        );
        setDistanceMeters(Math.round(dist));

        if (dist <= radiusMeters && !firedRef.current) {
          firedRef.current = true;
          onEnter(target.spotId);
        }
      },
      (err) => {
        // Non-fatal: user may have denied location. The modal simply won't auto-fire.
        console.warn('[GeofenceWatcher] GPS error:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 10_000 },
    );

    return stop;
  // onEnter is intentionally omitted from deps: it's a callback defined at call-site;
  // callers must memoize it themselves if stability matters. Listing it would cause
  // re-subscription every render if they pass an inline function.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.spotId, target?.lat, target?.lng, radiusMeters, supported, stop]);

  return { distanceMeters, supported, stop };
}
