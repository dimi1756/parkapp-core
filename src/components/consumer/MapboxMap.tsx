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

// Street-level detail: close enough that a tap reliably lands on the
// intended side of the road rather than clipping a neighboring one.
export const STREET_ZOOM = 17.5;

// Mapbox's classic Geocoding API (mapbox.places, used here previously)
// returns zero POI results for this token regardless of the `types` param --
// verified against globally-known chains with no proximity/country filter at
// all. Mapbox moved POI data (businesses, landmarks, hotels, pharmacies...)
// to the separate Search Box API a while back; the classic endpoint is
// address/postcode-only in practice now. suggest+retrieve below is that API.
const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

export interface GeocodeResult {
  name: string;
  address: string;
  lng: number;
  lat: number;
}

// One-shot lookup (Enter key with no dropdown selection): suggest for the
// top match, then retrieve to resolve its coordinates -- suggest results
// never carry a geometry themselves, by Search Box API design.
export async function geocodeAddress(query: string, proximity: [number, number]): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN || !query.trim()) return null;
  const sessionToken = crypto.randomUUID();
  const [top] = await searchPlaces(query, proximity, sessionToken, 1);
  if (!top) return null;
  const resolved = await retrievePlace(top.id, sessionToken);
  if (!resolved) return null;
  return { name: top.name, address: top.address, lng: resolved.lng, lat: resolved.lat };
}

export interface PlaceSuggestion {
  /** Search Box API's mapbox_id -- pass to retrievePlace to resolve coordinates. */
  id: string;
  /** Business/place/landmark name -- the dropdown's primary (bold) line. */
  name: string;
  /** Street address -- the dropdown's secondary (muted) line. */
  address: string;
}

// Autocomplete-style multi-result search for the live search dropdown, biased
// toward `proximity` and covering POIs (businesses, landmarks, hotels,
// pharmacies, ...) alongside plain addresses. `sessionToken` should be the
// same value for every keystroke of one search and the eventual retrieve
// call, then a fresh one for the next search -- that's what Mapbox groups
// together for Search Box API billing. Returns an empty array (never
// throws) on any failure so callers can render "no results" instead of
// crashing mid-keystroke.
export async function searchPlaces(
  query: string,
  proximity: [number, number],
  sessionToken: string,
  limit = 5
): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];

  const url = `${SEARCH_BOX_BASE}/suggest?q=${encodeURIComponent(query)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&limit=${limit}&country=gr&proximity=${proximity[0]},${proximity[1]}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return suggestions.map((s: { mapbox_id: string; name?: string; full_address?: string; place_formatted?: string }) => ({
      id: s.mapbox_id,
      name: s.name ?? query,
      address: s.full_address ?? s.place_formatted ?? '',
    }));
  } catch {
    return [];
  }
}

// Resolves a suggestion's actual coordinates -- must be called with the same
// sessionToken the suggest call that produced `mapboxId` used.
export async function retrievePlace(mapboxId: string, sessionToken: string): Promise<{ lng: number; lat: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = `${SEARCH_BOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords)) return null;
    const [lng, lat] = coords;
    return { lng, lat };
  } catch {
    return null;
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

// Snaps a tapped point to the nearest drivable road via the same Mapbox Map
// Matching call declare-spot's Edge Function uses server-side (isNearRoad) --
// giving the manual "I saw a free space" pin instant visual feedback that it
// landed on a real street, instead of finding out only after submitting.
export async function snapToRoad(lng: number, lat: number): Promise<{ lng: number; lat: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const coords = `${lng},${lat};${lng + 0.00001},${lat + 0.00001}`;
    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const matched = data?.matchings?.[0]?.geometry?.coordinates?.[0];
    if (!Array.isArray(matched)) return null;
    const [matchedLng, matchedLat] = matched;
    return { lng: matchedLng, lat: matchedLat };
  } catch {
    return null;
  }
}

export interface MapPin {
  id: string;
  lng: number;
  lat: number;
  type: 'mine' | 'reported' | 'destination' | 'selection' | 'poi';
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
  /** Fires when a 'mine'/'reported' spot pin itself is tapped (opens the spot details card). */
  onPinClick?: (pinId: string) => void;
  /** Fires after every pan/zoom settles with the new map center. */
  onCenterChange?: (lng: number, lat: number) => void;
  /** Full driving-route geometry from the Directions API; null clears the line. */
  routeCoordinates?: [number, number][] | null;
  /** Confirm-spot button shown above the temporary yellow "selection" pin. */
  onConfirmSelection?: () => void;
  /** Increment to imperatively re-trigger a fresh GPS fix + camera fly-to (wired to MapTab's "My Location" button). */
  locateRequestId?: number;
  /** Where the next flyToRequestId bump should smoothly fly/zoom the camera to (street-level zoom). */
  flyToTarget?: { lng: number; lat: number; zoom?: number } | null;
  /** Increment (with flyToTarget set) to imperatively fly the camera to a location at street-level zoom. */
  flyToRequestId?: number;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  center,
  userLocation,
  showCustomUserDot,
  onUserLocationChange,
  pins,
  onMapClick,
  onPinClick,
  onCenterChange,
  routeCoordinates,
  onConfirmSelection,
  locateRequestId,
  flyToTarget,
  flyToRequestId,
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
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
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
      zoom: STREET_ZOOM,
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

  // "I saw a free space" / "Emptying a space" bump this counter so the
  // camera is always at street-level zoom, centered on the user, before they
  // tap or the declaration submits -- guarantees a tap lands on the right
  // side of the right street instead of a stale, zoomed-out view.
  const prevFlyToRequestRef = useRef(flyToRequestId ?? 0);
  useEffect(() => {
    const id = flyToRequestId ?? 0;
    if (id !== prevFlyToRequestRef.current && flyToTarget && mapRef.current) {
      prevFlyToRequestRef.current = id;
      // An explicit zoom (search results ask for a specific, slightly wider
      // 16-17 so surrounding context stays visible) wins outright; the
      // declare/selection-mode callers that omit it just want "at least
      // street level," not to zoom back out if already tighter than that.
      const zoom = flyToTarget.zoom ?? Math.max(mapRef.current.getZoom(), STREET_ZOOM);
      mapRef.current.flyTo({
        center: [flyToTarget.lng, flyToTarget.lat],
        zoom,
        essential: true,
        speed: 1.4,
      });
    }
  }, [flyToRequestId, flyToTarget]);

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

      // "poi" is the smaller secondary pin: the actual searched destination,
      // now that the main pin routes to the nearest parking spot instead --
      // visually subordinate (smaller, distinct purple) so it never competes
      // with the primary red spot/destination pin for attention.
      const isPoi = pin.type === 'poi';
      const color = pin.type === 'mine' ? '#16a34a' : pin.type === 'reported' ? '#2563eb' : isPoi ? '#9333ea' : '#dc2626';
      const size = isPoi ? 22 : 34;
      const el = document.createElement('div');
      el.className = 'mapbox-pin-wrapper';
      el.innerHTML = `
        <svg width="${size}" height="${Math.round((size * 44) / 34)}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="17" cy="17" r="6" fill="white"/>
        </svg>
      `;

      // 'mine'/'reported' pins open the spot details bottom card on tap
      // (distance/time/ETA + Get Directions) instead of Mapbox's own text
      // popup -- the two would otherwise fire on top of each other.
      const opensDetailsCard = pin.type === 'mine' || pin.type === 'reported';
      if (opensDetailsCard) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPinClickRef.current?.(pin.id);
        });
        markersRef.current[pin.id] = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
      } else if (pin.label) {
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

  // Real driving-route polyline from the Directions API. Mapbox's driving
  // profile already returns one continuous geometry across ferry legs when a
  // crossing is part of the route (verified directly against the API: a
  // mainland-to-island request comes back `code: "Ok"` with a `mode: "ferry"`
  // leg baked into the same LineString) -- so the data was never the gap.
  // What made a ferry route look "broken" was the camera: nothing here ever
  // repositioned it to fit a route that might span many kilometers of open
  // water, so only whichever end the camera happened to be centered on was
  // actually visible. fitBounds after every new/updated route fixes that.
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
      } else {
        if (!routeCoordinates) return;
        map.addSource('route', { type: 'geojson', data });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#0059B3', 'line-width': 5 },
        });
      }

      if (routeCoordinates && routeCoordinates.length > 1) {
        const bounds = routeCoordinates.reduce(
          (b, coord) => b.extend(coord),
          new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0])
        );
        // Padding clears the search/turn-by-turn banner up top and the
        // action buttons + destination card at the bottom, so the fitted
        // route isn't hidden edge-to-edge behind the UI chrome.
        map.fitBounds(bounds, {
          padding: { top: 140, bottom: 260, left: 50, right: 50 },
          duration: 1200,
          maxZoom: STREET_ZOOM,
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once('load', drawRoute);
    }
  }, [routeCoordinates]);

  return <div ref={containerRef} className="parkapp-map-shell absolute inset-0 w-full h-full" />;
};
