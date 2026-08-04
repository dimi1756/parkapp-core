import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLanguage } from '@/contexts/LanguageContext';

// Reads the token from an env variable so it's never hardcoded in source.
// Add VITE_MAPBOX_TOKEN=pk.xxxxx to a .env file at the project root.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Guards against the easy mistake of copying .env.example verbatim into
// .env: the placeholder string is non-empty, so a naive Boolean(token)
// check would treat it as "configured" and silently fail every map load.
const PLACEHOLDER_TOKEN = 'pk.your_mapbox_token_here';

export const isMapboxConfigured = Boolean(MAPBOX_TOKEN && MAPBOX_TOKEN !== PLACEHOLDER_TOKEN);

export interface GeocodeResult {
  name: string;
  lng: number;
  lat: number;
}

// Looks up a real place/address using the Mapbox Geocoding API, biased toward
// results near `proximity`. Returns null if nothing matches (invalid query)
// or if no token is configured.
export async function geocodeAddress(query: string, proximity: [number, number]): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN || !query.trim()) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=gr&proximity=${proximity[0]},${proximity[1]}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature || !Array.isArray(feature.center)) return null;
    const [lng, lat] = feature.center;
    return { name: feature.place_name ?? query, lng, lat };
  } catch {
    return null;
  }
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

// Autocomplete-style multi-result search for the live search dropdown, biased
// toward `proximity`. Returns an empty array (never throws) on any failure so
// callers can render "no results" instead of crashing mid-keystroke.
export async function searchPlaces(
  query: string,
  proximity: [number, number],
  limit = 5
): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=${limit}&country=gr&proximity=${proximity[0]},${proximity[1]}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .filter((f: { center?: unknown }) => Array.isArray(f.center))
      .map((f: { id: string; place_name?: string; text?: string; center: [number, number] }) => ({
        id: f.id,
        name: f.place_name ?? f.text ?? query,
        lng: f.center[0],
        lat: f.center[1],
      }));
  } catch {
    return [];
  }
}

export interface RouteStep {
  /** Human-readable maneuver text, already localized by Mapbox via the `language` param. */
  instruction: string;
  maneuverType: string;
  maneuverModifier?: string;
  maneuverLocation: [number, number];
  distanceMeters: number;
  durationSeconds: number;
}

export interface DirectionsResult {
  /** [lng, lat] pairs tracing the actual driving route, ready for a GeoJSON LineString. */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  /** Turn-by-turn maneuvers for the Google-Maps-style navigation banner. */
  steps: RouteStep[];
}

// Real turn-by-turn driving route between two points via the Mapbox
// Directions API. Returns null on any failure (no route found, offline,
// misconfigured token) so the caller can fall back to showing just the
// destination pin with no route line.
export async function getDrivingDirections(
  origin: [number, number],
  destination: [number, number],
  language: 'en' | 'el' = 'en'
): Promise<DirectionsResult | null> {
  if (!MAPBOX_TOKEN) return null;

  const coordsParam = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson&overview=full&steps=true&language=${language}&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates) return null;

    const rawSteps: unknown[] = route?.legs?.[0]?.steps ?? [];
    const steps: RouteStep[] = rawSteps
      .filter(
        (s): s is { maneuver: { location: [number, number] } } =>
          Array.isArray((s as { maneuver?: { location?: unknown } })?.maneuver?.location)
      )
      .map((s) => {
        const step = s as {
          maneuver: { instruction: string; type: string; modifier?: string; location: [number, number] };
          distance: number;
          duration: number;
        };
        return {
          instruction: step.maneuver.instruction,
          maneuverType: step.maneuver.type,
          maneuverModifier: step.maneuver.modifier,
          maneuverLocation: step.maneuver.location,
          distanceMeters: step.distance,
          durationSeconds: step.duration,
        };
      });

    return {
      coordinates: route.geometry.coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps,
    };
  } catch {
    return null;
  }
}

export interface MapPin {
  id: string;
  lng: number;
  lat: number;
  type: 'mine' | 'reported' | 'destination' | 'selection';
  label?: string;
}

interface MapboxMapProps {
  center: [number, number]; // [lng, lat]
  /** Mock position for the demo account; ignored once real GPS is live. */
  userLocation: [number, number];
  /** Demo accounts render a custom mock dot; real accounts rely on Mapbox's own GeolocateControl blue dot. */
  showCustomUserDot: boolean;
  /** Fires with each real GPS fix once GeolocateControl starts tracking (real accounts only). */
  onUserLocationChange?: (lng: number, lat: number, accuracy: number) => void;
  pins: MapPin[];
  onMapClick?: (lng: number, lat: number) => void;
  /** Fires after every pan/zoom settles with the new map center. */
  onCenterChange?: (lng: number, lat: number) => void;
  /** Full driving-route geometry from the Directions API; null clears the line. */
  routeCoordinates?: [number, number][] | null;
  /** Confirm-spot button shown above the temporary yellow "selection" pin. */
  onConfirmSelection?: () => void;
  /** Increment to imperatively re-trigger a fresh GPS fix + camera fly-to (wired to MapTab's "My Location" button). */
  locateRequestId?: number;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  center,
  userLocation,
  showCustomUserDot,
  onUserLocationChange,
  pins,
  onMapClick,
  onCenterChange,
  routeCoordinates,
  onConfirmSelection,
  locateRequestId,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Refs keep the map's native event listeners (bound once, at mount) wired
  // to whatever the latest render's callbacks/values are, without needing to
  // tear down and recreate the whole mapboxgl.Map every time a prop changes.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const onUserLocationChangeRef = useRef(onUserLocationChange);
  onUserLocationChangeRef.current = onUserLocationChange;
  const onConfirmSelectionRef = useRef(onConfirmSelection);
  onConfirmSelectionRef.current = onConfirmSelection;
  const showCustomUserDotRef = useRef(showCustomUserDot);
  showCustomUserDotRef.current = showCustomUserDot;
  const confirmLabelRef = useRef(t('map.confirmSpot'));
  confirmLabelRef.current = t('map.confirmSpot');

  // Initialize map once
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 17,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    });
    map.addControl(geolocate, 'top-right');

    geolocate.on('geolocate', (e) => {
      const { longitude, latitude, accuracy } = (e as GeolocationPosition).coords;
      onUserLocationChangeRef.current?.(longitude, latitude, accuracy);
    });

    geolocateControlRef.current = geolocate;

    map.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChangeRef.current?.(c.lng, c.lat);
    });

    map.on('load', () => {
      // Real accounts: prompt for location permission immediately and start
      // live tracking. Demo accounts keep the mocked map-center position and
      // never trigger a real GPS prompt.
      if (!showCustomUserDotRef.current) {
        geolocate.trigger();
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "My Location" button (rendered by MapTab) bumps this counter to request
  // a fresh fix. Re-uses GeolocateControl's own trigger(), which prompts for
  // permission if needed, updates its blue dot, and flies the camera to the
  // result -- the skip-on-mount guard keeps the initial render from firing.
  const prevLocateRequestRef = useRef(locateRequestId ?? 0);
  useEffect(() => {
    const id = locateRequestId ?? 0;
    if (id !== prevLocateRequestRef.current) {
      prevLocateRequestRef.current = id;
      geolocateControlRef.current?.trigger();
    }
  }, [locateRequestId]);

  // Demo-only mock dot. Real accounts rely entirely on GeolocateControl's
  // own blue dot, which tracks position independently of React state.
  useEffect(() => {
    if (!mapRef.current) return;

    if (!showCustomUserDot) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'mapbox-user-dot';
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userLocation).addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat(userLocation);
    }
  }, [userLocation, showCustomUserDot]);

  // Sync pins with markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set(pins.map((p) => p.id));

    // Remove markers that no longer exist
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    pins.forEach((pin) => {
      if (markersRef.current[pin.id]) {
        markersRef.current[pin.id].setLngLat([pin.lng, pin.lat]);
        return;
      }

      if (pin.type === 'selection') {
        // Temporary "drop pin" marker for the Map Selection Mode flow: a
        // yellow pin with a Confirm button anchored right above it. Mapbox
        // repositions the whole element together on every pan/zoom, so the
        // button never drifts away from its pin.
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center gap-1.5';
        wrapper.innerHTML = `
          <button type="button" class="confirm-spot-btn inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg whitespace-nowrap hover:bg-primary/90 transition-colors">
            ${confirmLabelRef.current}
          </button>
          <svg width="30" height="38" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="#f59e0b" stroke="white" stroke-width="2"/>
            <circle cx="17" cy="17" r="6" fill="white"/>
          </svg>
        `;
        wrapper.querySelector('.confirm-spot-btn')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onConfirmSelectionRef.current?.();
        });
        markersRef.current[pin.id] = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
        return;
      }

      const color = pin.type === 'mine' ? '#16a34a' : pin.type === 'reported' ? '#2563eb' : '#dc2626';
      const el = document.createElement('div');
      el.className = 'mapbox-pin-wrapper';
      el.innerHTML = `
        <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="17" cy="17" r="6" fill="white"/>
        </svg>
      `;

      if (pin.label) {
        const popup = new mapboxgl.Popup({ offset: 36 }).setText(pin.label);
        markersRef.current[pin.id] = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(popup)
          .addTo(map);
      } else {
        markersRef.current[pin.id] = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
      }
    });
  }, [pins]);

  // Real driving-route polyline from the Directions API
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const drawRoute = () => {
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates ?? [],
        },
      };

      if (map.getSource('route')) {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(data);
        return;
      }

      if (!routeCoordinates) return;

      map.addSource('route', { type: 'geojson', data });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#0059B3', 'line-width': 5 },
      });
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once('load', drawRoute);
    }
  }, [routeCoordinates]);

  return <div ref={containerRef} className="parkapp-map-shell absolute inset-0 w-full h-full" />;
};
