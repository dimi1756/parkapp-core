import { useCallback } from "react";

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Single choke point for reading device location. Today it calls the browser
 * Geolocation API; when this ships wrapped in Capacitor, swap the body for
 * `Geolocation.getCurrentPosition()` from `@capacitor/geolocation` without
 * touching any call site.
 */
export function useGeolocation() {
  const getCurrentPosition = useCallback((): Promise<GeoCoords> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation is not available on this device."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
      );
    });
  }, []);

  return { getCurrentPosition };
}
