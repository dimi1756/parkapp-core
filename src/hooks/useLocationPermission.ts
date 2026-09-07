import { useCallback, useEffect, useState } from 'react';
import {
  getLocationPermission,
  requestLocationPermission,
  subscribeToPermission,
  type LocationPermission,
} from '@/lib/geolocation';

/**
 * Live location-permission state for the UI.
 *
 * The app can't do its main job without a position: "find spots near me",
 * "claim the nearest one", "route me there" are all meaningless without one.
 * Rather than letting those actions fail quietly one by one, surfaces read
 * this and say plainly what's missing.
 *
 * `request` triggers the browser's own prompt. Once a user has refused, the
 * browser will not ask again from script -- so a 'denied' state is a
 * dead end that only the user can clear in site settings, and the UI has to
 * say that rather than offering a button that does nothing.
 */
export function useLocationPermission() {
  const [permission, setPermission] = useState<LocationPermission>(getLocationPermission);

  useEffect(() => subscribeToPermission(setPermission), []);

  const request = useCallback(async () => {
    const next = await requestLocationPermission();
    setPermission(next);
    return next;
  }, []);

  return {
    permission,
    /** The user actively refused, or the device has no geolocation at all. */
    denied: permission === 'denied' || permission === 'unavailable',
    /** A position is available, so location-dependent actions can run. */
    granted: permission === 'granted',
    request,
  };
}
