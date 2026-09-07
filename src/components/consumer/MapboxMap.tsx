import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Plus, Minus, Compass, LocateFixed, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLastFix, requestFreshFix, subscribeToPosition } from '@/lib/geolocation';
import { zonesToGeoJson, type ParkingZone } from '@/lib/zones';
import { operatingAreaToGeoJson, type OperatingArea } from '@/lib/operatingArea';

// Reads the token from an env variable so it's never hardcoded in source.
// Add VITE_MAPBOX_TOKEN=pk.xxxxx to a .env file at the project root.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Guards against the easy mistake of copying .env.example verbatim into
// .env: the placeholder string is non-empty, so a naive Boolean(token)
// check would treat it as "configured" and silently fail every map load.
const PLACEHOLDER_TOKEN = 'pk.your_mapbox_token_here';

export const isMapboxConfigured = Boolean(MAPBOX_TOKEN && MAPBOX_TOKEN !== PLACEHOLDER_TOKEN);

// Loud, one-off console notice instead of a live map silently turning into a
// flat picture: the static fallback is a deliberate safety net, but a
// deployment that hit it by accident (missing/placeholder token) should be
// obvious to whoever opens the console, not something noticed mid-demo.
if (!isMapboxConfigured) {
  console.warn(
    '[MapboxMap] VITE_MAPBOX_TOKEN is missing or still the .env.example placeholder -- ' +
      'falling back to the static offline map. Live map, search and routing are disabled.'
  );
}

// Street-level detail: close enough that a tap reliably lands on the
// intended side of the road rather than clipping a neighboring one.
export const STREET_ZOOM = 17.5;

// Camera state survives a remount. ConsumerApp renders the active tab with
// `key={activeTab}`, so leaving the Map tab and coming back tears this
// component down completely -- without this, every return snapped the driver
// back to the default center/zoom and threw away wherever they had panned.
let lastCamera: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null;

// Whether this session has already performed its one automatic "centre on
// the driver" move. Module-scoped for the same reason as lastCamera: the
// auto-centre is a first-run courtesy, not something to redo on every
// remount (which is exactly what re-triggering GeolocateControl used to do).
let hasAutoCenteredThisSession = false;

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
  /**
   * Metres from the `proximity` point, straight from Mapbox (it measures it
   * against the same point we bias with). Real, not estimated. Undefined for
   * results the API returns without one.
   */
  distanceMeters?: number;
  /** Mapbox POI category ("pharmacy", "restaurant", ...), used to pick the row icon. */
  category?: string;
}

/**
 * Bounding box, in degrees, for a hard local restriction around `proximity`.
 *
 * `proximity` alone is only a soft bias: for a generic term like "pharmacy"
 * Mapbox happily ranked well-known Athens results above the ones on the next
 * street, because a brand match outweighs a few hundred kilometres. A bbox
 * is a filter rather than a preference, so those simply stop coming back.
 *
 * 30km is wide enough to cover a town and everything a driver might plausibly
 * drive to from it, and narrow enough to keep another city's results out.
 */
const LOCAL_SEARCH_RADIUS_KM = 30;

function localBbox([lng, lat]: [number, number]): string {
  const dLat = LOCAL_SEARCH_RADIUS_KM / 111.32;
  // Longitude degrees shrink toward the poles; without this the box would be
  // far too narrow in Greece and too wide near the equator.
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const clampLat = (v: number) => Math.min(90, Math.max(-90, v));
  return [lng - dLng, clampLat(lat - dLat), lng + dLng, clampLat(lat + dLat)]
    .map((v) => v.toFixed(6))
    .join(',');
}

// Autocomplete-style multi-result search for the live search dropdown, biased
// toward `proximity` and covering POIs (businesses, landmarks, hotels,
// pharmacies, ...) alongside plain addresses. `sessionToken` should be the
// same value for every keystroke of one search and the eventual retrieve
// call, then a fresh one for the next search -- that's what Mapbox groups
// together for Search Box API billing. Returns an empty array (never
// throws) on any failure so callers can render "no results" instead of
// crashing mid-keystroke.
interface SuggestFeature {
  mapbox_id: string;
  name?: string;
  full_address?: string;
  place_formatted?: string;
  distance?: number;
  poi_category?: string[];
  maki?: string;
}

async function fetchSuggestions(url: string, query: string): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions: SuggestFeature[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return suggestions.map((s) => ({
      id: s.mapbox_id,
      name: s.name ?? query,
      address: s.full_address ?? s.place_formatted ?? '',
      distanceMeters: typeof s.distance === 'number' ? s.distance : undefined,
      category: s.poi_category?.[0] ?? s.maki,
    }));
  } catch {
    return [];
  }
}

export async function searchPlaces(
  query: string,
  proximity: [number, number],
  sessionToken: string,
  limit = 5,
  language = 'el'
): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];

  const base =
    `${SEARCH_BOX_BASE}/suggest?q=${encodeURIComponent(query)}&access_token=${MAPBOX_TOKEN}` +
    `&session_token=${sessionToken}&limit=${limit}&country=gr&language=${language}` +
    `&proximity=${proximity[0]},${proximity[1]}`;

  // Local first. If nothing in the box matches, fall back to the unbounded
  // search so someone deliberately looking up another city still gets it --
  // the bbox is there to reorder everyday searches, not to trap the driver
  // inside a 30km circle.
  const local = await fetchSuggestions(`${base}&bbox=${localBbox(proximity)}`, query);
  if (local.length > 0) return local;
  return fetchSuggestions(base, query);
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

/**
 * Street name at a coordinate, via Mapbox reverse geocoding.
 *
 * types=street asks for the road itself rather than the building or the
 * neighbourhood, which is what the predictive suggestions are about. Returns
 * null on any failure so a caller can simply drop that candidate -- a
 * missing street name is not worth an error path of its own.
 */
export async function reverseGeocodeStreet(
  lng: number,
  lat: number,
  language: 'en' | 'el' = 'en'
): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}` +
    `&types=street&limit=1&language=${language}&access_token=${MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const name = data?.features?.[0]?.properties?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
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
  return getDirections(origin, destination, 'driving', language);
}

// The "Yes, I'm parking" -> final-POI leg: same Directions API, walking
// profile, no turn-by-turn banner needed (the dashed line + destination pin
// carry it for a short walk) so `steps` comes back empty rather than unused.
export async function getWalkingDirections(
  origin: [number, number],
  destination: [number, number],
  language: 'en' | 'el' = 'en'
): Promise<DirectionsResult | null> {
  return getDirections(origin, destination, 'walking', language);
}

async function getDirections(
  origin: [number, number],
  destination: [number, number],
  profile: 'driving' | 'walking',
  language: 'en' | 'el'
): Promise<DirectionsResult | null> {
  if (!MAPBOX_TOKEN) return null;

  const coordsParam = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsParam}?geometries=geojson&overview=full&steps=true&language=${language}&access_token=${MAPBOX_TOKEN}`;

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
  type: 'mine' | 'reported' | 'destination' | 'selection' | 'poi' | 'garage';
  label?: string;
  /** 'garage' only: occupancy colour, so the marker matches its details card. */
  color?: string;
}

interface MapboxMapProps {
  center: [number, number]; // [lng, lat]
  /** Mock position for the demo account; ignored once real GPS is live. */
  userLocation: [number, number];
  /** Fires with each real GPS fix once GeolocateControl starts tracking (real accounts only). */
  onUserLocationChange?: (lng: number, lat: number, accuracy: number) => void;
  pins: MapPin[];
  onMapClick?: (lng: number, lat: number) => void;
  /** Fires when a 'mine'/'reported' spot pin itself is tapped (opens the spot details card). */
  onPinClick?: (pinId: string) => void;
  /** Fires when the X badge on one of the driver's own ('mine') pins is tapped -- removes that declaration from the map. */
  onDeleteOwnPin?: (pinId: string) => void;
  /** Fires after every pan/zoom settles with the new map center. */
  onCenterChange?: (lng: number, lat: number) => void;
  /** Full driving-route geometry from the Directions API; null clears the line. */
  routeCoordinates?: [number, number][] | null;
  /** 'walking' renders the route as a dashed line (post-claim leg to a final POI); default 'driving' is solid. */
  routeProfile?: 'driving' | 'walking';
  /** True while turn-by-turn driving navigation is actively running -- tilts the camera to a 3D chase view and follows the driver's heading, Google-Maps-style. Left level for the walking leg (nobody wants a tilted phone for a 2-minute walk). */
  isNavigating?: boolean;
  /** Confirm-spot button shown above the temporary yellow "selection" pin. */
  onConfirmSelection?: () => void;
  /** Increment to imperatively re-trigger a fresh GPS fix + camera fly-to (wired to MapTab's "My Location" button). */
  locateRequestId?: number;
  /** Where the next flyToRequestId bump should smoothly fly/zoom the camera to (street-level zoom). */
  flyToTarget?: { lng: number; lat: number; zoom?: number; duration?: number } | null;
  /** Increment (with flyToTarget set) to imperatively fly the camera to a location at street-level zoom. */
  flyToRequestId?: number;
  /** Controlled/resident parking zones, drawn as shaded no-declare areas. Omit to draw none. */
  zones?: ParkingZone[];
  /** Fires when the location button can't get a fix (permission refused, no signal) so the caller can explain why. */
  onLocateFailed?: () => void;
  /** Fires with a zone id when one of the drawn zones is tapped. */
  onZoneClick?: (zoneId: string) => void;
  /** While true, each new GPS fix recentres the camera -- until the driver pans away. */
  followUser?: boolean;
  /** The municipality's covered area, drawn as a boundary circle. Omit to draw none. */
  operatingArea?: OperatingArea | null;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  center,
  userLocation,
  onUserLocationChange,
  pins,
  onMapClick,
  onPinClick,
  onDeleteOwnPin,
  onCenterChange,
  routeCoordinates,
  routeProfile = 'driving',
  isNavigating = false,
  onConfirmSelection,
  locateRequestId,
  flyToTarget,
  flyToRequestId,
  zones,
  onLocateFailed,
  onZoneClick,
  followUser = false,
  operatingArea,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Live compass heading of the camera, mirrored into React state purely so
  // the orientation button's needle can rotate with it. Rounded to whole
  // degrees so a rotate gesture (or the driving chase camera) doesn't
  // re-render this component on every animation frame.
  const [bearing, setBearing] = useState(() => Math.round(lastCamera?.bearing ?? 0));
  const [pitch, setPitch] = useState(() => Math.round(lastCamera?.pitch ?? 0));

  // True once a real GPS fix exists for this (non-demo) session -- gates the
  // user dot, which now belongs to this component rather than to Mapbox's
  // GeolocateControl.
  const [hasRealFix, setHasRealFix] = useState(() => getLastFix() !== null);

  // True while the location button is waiting on a fresh fix.
  const [locating, setLocating] = useState(false);

  // Flipped the moment the driver moves the camera themselves (drag, pinch,
  // rotate). From then on, live GPS fixes update the dot but never move the
  // camera -- panning away to look at another street is a deliberate act and
  // must not be undone half a second later by the next position tick.
  const userMovedCameraRef = useRef(false);

  // Refs keep the map's native event listeners (bound once, at mount) wired
  // to whatever the latest render's callbacks/values are, without needing to
  // tear down and recreate the whole mapboxgl.Map every time a prop changes.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const onDeleteOwnPinRef = useRef(onDeleteOwnPin);
  onDeleteOwnPinRef.current = onDeleteOwnPin;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const onUserLocationChangeRef = useRef(onUserLocationChange);
  onUserLocationChangeRef.current = onUserLocationChange;
  const onConfirmSelectionRef = useRef(onConfirmSelection);
  onConfirmSelectionRef.current = onConfirmSelection;
  const onLocateFailedRef = useRef(onLocateFailed);
  onLocateFailedRef.current = onLocateFailed;
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;
  const followUserRef = useRef(followUser);
  followUserRef.current = followUser;
  const isNavigatingRef = useRef(isNavigating);
  isNavigatingRef.current = isNavigating;
  const routeProfileRef = useRef(routeProfile);
  routeProfileRef.current = routeProfile;
  const confirmLabelRef = useRef(t('map.confirmSpot'));
  confirmLabelRef.current = t('map.confirmSpot');

  // Initialize map once
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Resume exactly where this session's camera was left, if the Map tab
    // has been open before -- otherwise start from the caller's center.
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: lastCamera?.center ?? center,
      zoom: lastCamera?.zoom ?? STREET_ZOOM,
      bearing: lastCamera?.bearing ?? 0,
      pitch: lastCamera?.pitch ?? 0,
      // Mapbox's own zoom/compass/geolocate widgets are gone: they were
      // pinned under the floating search bar (top-right, y=10) where they
      // were physically unclickable, and GeolocateControl moved the camera
      // as a side effect of every fix. Both jobs are now done by this
      // component's own controls plus src/lib/geolocation.ts.
      attributionControl: true,
    });

    map.on('click', (e) => {
      // A zone tap calls preventDefault on its own layer handler; honouring
      // it here stops one tap from both opening the zone card and dropping a
      // selection pin underneath it.
      if (e.defaultPrevented) return;
      onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
    });

    // `originalEvent` is only present when the movement came from a real
    // gesture (drag/pinch/rotate/scroll), never from our own flyTo/easeTo --
    // which is exactly the distinction "did the driver take over the
    // camera?" needs.
    map.on('movestart', (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) userMovedCameraRef.current = true;
    });

    // 'rotate' covers gesture rotation; 'move' also catches bearing changes
    // that arrive through an easeTo/flyTo (the driving chase camera, or the
    // reset below), so the needle can never drift out of sync with the map.
    const syncCamera = () => {
      const nextBearing = Math.round(map.getBearing());
      const nextPitch = Math.round(map.getPitch());
      setBearing((prev) => (prev === nextBearing ? prev : nextBearing));
      setPitch((prev) => (prev === nextPitch ? prev : nextPitch));
    };
    map.on('rotate', syncCamera);
    map.on('move', syncCamera);

    map.on('moveend', () => {
      const c = map.getCenter();
      lastCamera = {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      onCenterChangeRef.current?.(c.lng, c.lat);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live position for real accounts. One shared watch for the whole session
  // (see src/lib/geolocation.ts) means the permission prompt happens once
  // and stays granted across tab switches, instead of a fresh control being
  // created and re-triggered on every remount of this component.
  //
  // Camera policy, deliberately conservative: a fix moves the dot always,
  // and moves the camera only on the session's very first fix and only if
  // the driver hasn't already panned somewhere themselves.
  useEffect(() => {
    return subscribeToPosition((fix) => {
      setHasRealFix(true);
      onUserLocationChangeRef.current?.(fix.lng, fix.lat, fix.accuracy);

      const map = mapRef.current;
      if (!map) return;

      // Chase-camera rotation: only while actively driving (a walk or idle
      // browsing shouldn't spin the map), and only on a real compass
      // heading -- most desktop/no-motion fixes report heading as null, so
      // this simply never fires there rather than snapping to a bogus 0.
      if (isNavigatingRef.current && routeProfileRef.current === 'driving' && fix.heading != null && !Number.isNaN(fix.heading)) {
        map.easeTo({ bearing: fix.heading, duration: 500 });
      }

      // Follow mode (navigation, or straight after a claim): every fix
      // recentres, Google-Maps style -- until the driver pans away, at which
      // point userMovedCameraRef latches and the camera is theirs again
      // until they ask for it back via the location button.
      if (followUserRef.current && !userMovedCameraRef.current) {
        map.easeTo({ center: [fix.lng, fix.lat], duration: 700 });
        return;
      }

      if (!hasAutoCenteredThisSession && !userMovedCameraRef.current) {
        hasAutoCenteredThisSession = true;
        map.easeTo({
          center: [fix.lng, fix.lat],
          zoom: Math.max(map.getZoom(), STREET_ZOOM),
          duration: 800,
        });
      }
    });
  }, []);

  // Turning follow mode on recentres straight away rather than waiting for
  // the next GPS tick, and clears any earlier pan -- starting navigation is
  // an explicit request to be followed.
  useEffect(() => {
    if (!followUser) return;
    userMovedCameraRef.current = false;
    const map = mapRef.current;
    const fix = getLastFix();
    if (!map || !fix) return;
    map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), STREET_ZOOM), duration: 700 });
  }, [followUser]);

  // "My Location" button (rendered by MapTab) bumps this counter. This is
  // the one gesture that explicitly asks to be re-centred, so it also clears
  // the "driver took over the camera" flag. The cached fix moves the camera
  // instantly; a fresh one corrects it a moment later if the device has
  // moved since. The skip-on-mount guard keeps the initial render from firing.
  const prevLocateRequestRef = useRef(locateRequestId ?? 0);
  useEffect(() => {
    const id = locateRequestId ?? 0;
    if (id === prevLocateRequestRef.current) return;
    prevLocateRequestRef.current = id;
    userMovedCameraRef.current = false;

    const centerOn = (lng: number, lat: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), STREET_ZOOM), duration: 700 });
    };

    const cached = getLastFix();
    if (cached) centerOn(cached.lng, cached.lat);

    requestFreshFix().then((fix) => {
      if (!fix) return;
      setHasRealFix(true);
      onUserLocationChangeRef.current?.(fix.lng, fix.lat, fix.accuracy);
      centerOn(fix.lng, fix.lat);
    });
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
      // An explicit duration (e.g. "Claim nearest spot" asking for a snappy,
      // predictable 1000ms hop straight to the claimed spot) wins outright;
      // everything else keeps the original speed-based timing, which varies
      // with distance -- appropriate for "fly to wherever the user is,"
      // wrong for "always take exactly this long."
      mapRef.current.flyTo({
        center: [flyToTarget.lng, flyToTarget.lat],
        zoom,
        essential: true,
        ...(flyToTarget.duration != null ? { duration: flyToTarget.duration } : { speed: 1.4 }),
      });
    }
  }, [flyToRequestId, flyToTarget]);

  // The user dot: this component's job now, rather than GeolocateControl's
  // blue dot, which came bundled with camera behaviour we no longer want.
  //
  // Shown as soon as a real fix exists -- there is no simulated position any
  // more, for any account.
  const showUserDot = hasRealFix;
  useEffect(() => {
    if (!mapRef.current) return;

    if (!showUserDot) {
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
  }, [userLocation, showUserDot]);

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

      if (pin.type === 'garage') {
        // A rounded "P" plate rather than a teardrop: this marks a building
        // with many spaces, and must not be mistaken at a glance for one of
        // the single community-reported spots around it. Colour comes from
        // the caller so it always agrees with the occupancy bar on the card.
        const el = document.createElement('div');
        el.className = 'mapbox-pin-wrapper';
        el.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:${pin.color ?? '#2563eb'};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);color:white;font-weight:800;font-size:15px;font-family:inherit;line-height:1;">P</div>
        `;
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPinClickRef.current?.(pin.id);
        });
        markersRef.current[pin.id] = new mapboxgl.Marker({ element: el })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
        return;
      }

      // "poi" is the smaller secondary pin: the actual searched destination,
      // now that the main pin routes to the nearest parking spot instead --
      // visually subordinate (smaller, distinct purple) so it never competes
      // with the primary red spot/destination pin for attention.
      const isPoi = pin.type === 'poi';
      const isMine = pin.type === 'mine';
      const color = isMine ? '#16a34a' : pin.type === 'reported' ? '#2563eb' : isPoi ? '#9333ea' : '#dc2626';
      const size = isPoi ? 22 : 34;
      const el = document.createElement('div');
      // Mapbox's own `.mapboxgl-marker` CSS class sets `position: absolute`
      // on this exact element -- it's what keeps the marker shrink-wrapped
      // to the SVG's actual 34x44 box instead of a block-level div's default
      // 100%-of-parent width, which is what the anchor-offset math (-50%,
      // -100% of the element's own rendered size) is computed against. A
      // `relative` class here previously won that cascade (later stylesheet,
      // same specificity) and blew the box out to the full map width --
      // desyncing the pin from its actual GPS coordinate and scattering the
      // X badge god knows where. The badge's relative positioning now lives
      // on an inner, non-marker wrapper instead, leaving el's own position
      // untouched.
      el.className = 'mapbox-pin-wrapper';
      el.innerHTML = `
        <div style="position:relative;width:${size}px;height:${Math.round((size * 44) / 34)}px;">
          <svg width="${size}" height="${Math.round((size * 44) / 34)}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="${color}" stroke="white" stroke-width="2"/>
            <circle cx="17" cy="17" r="6" fill="white"/>
          </svg>
          ${
            isMine
              ? `<button type="button" class="delete-own-pin-btn" aria-label="Remove this spot" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:9999px;background:#dc2626;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:pointer;padding:0;">
                  <svg width="9" height="9" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M1 1L9 9M9 1L1 9"/></svg>
                </button>`
              : ''
          }
        </div>
      `;
      if (isMine) {
        el.querySelector('.delete-own-pin-btn')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onDeleteOwnPinRef.current?.(pin.id);
        });
      }

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

  // The operating-area boundary. Drawn as a faint fill with a dashed edge
  // rather than a dimming mask over everything outside it: the driver still
  // needs to read the map beyond the boundary (that is where they might be
  // heading), they just need to know where the service stops.
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const draw = () => {
      const source = map.getSource('operating-area') as mapboxgl.GeoJSONSource | undefined;
      if (!operatingArea) {
        // Emptying the source rather than removing the layers keeps this
        // idempotent -- the area can arrive, change, or clear at any time.
        source?.setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      const data = operatingAreaToGeoJson(operatingArea);
      if (source) {
        source.setData(data);
        return;
      }

      // First time the boundary arrives: if the camera is still sitting on a
      // default (no restored position, no GPS fix, driver hasn't panned),
      // open on the city rather than on a generic fallback point. Matters
      // most for a driver who refused location -- they should still see
      // their own town.
      if (!lastCamera && !getLastFix() && !userMovedCameraRef.current) {
        map.jumpTo({ center: operatingArea.center, zoom: 13 });
      }

      map.addSource('operating-area', { type: 'geojson', data });
      // Added at the very bottom of the app's own layers so zones, routes and
      // markers all stay legible over it.
      const beforeId = map.getLayer('parking-zones-line') ? 'parking-zones-line' : undefined;
      map.addLayer(
        {
          id: 'operating-area-fill',
          type: 'fill',
          source: 'operating-area',
          paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.06 },
        },
        beforeId
      );
      map.addLayer(
        {
          id: 'operating-area-outline',
          type: 'line',
          source: 'operating-area',
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
        },
        beforeId
      );
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [operatingArea]);

  // Controlled/resident parking zones, drawn as thick lines along the street
  // axis. A filled corridor polygon (what this used to be) inevitably spilled
  // over the buildings either side; a wide line hugs the road at every zoom
  // and reads as "this street is protected". Sits beneath the route line so a
  // route crossing a zone stays readable, and beneath every marker (Mapbox
  // markers are DOM elements, always above canvas layers).
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const drawZones = () => {
      const data = zonesToGeoJson(zones ?? []);
      const source = map.getSource('parking-zones') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      if (!zones || zones.length === 0) return;

      map.addSource('parking-zones', { type: 'geojson', data });
      // Red for residents-only, amber for controlled/paid: the first is a
      // harder "not yours to give away", and both match the destructive /
      // warning roles the rest of the app already uses.
      const zoneColor = ['match', ['get', 'kind'], 'resident', '#dc2626', '#f59e0b'] as unknown as string;
      const beforeId = map.getLayer('route-casing') ? 'route-casing' : undefined;

      // Interpolated width so the band tracks the street's apparent size
      // instead of staying a fixed pixel thickness while the map zooms.
      map.addLayer(
        {
          id: 'parking-zones-line',
          type: 'line',
          source: 'parking-zones',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': zoneColor,
            'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 16, 14, 19, 26],
            'line-opacity': 0.45,
          },
        },
        beforeId
      );
      // Solid hairline down the middle: without it the translucent band
      // reads as a vague smudge rather than a marked street.
      map.addLayer(
        {
          id: 'parking-zones-spine',
          type: 'line',
          source: 'parking-zones',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': zoneColor, 'line-width': 2, 'line-opacity': 0.9 },
        },
        beforeId
      );

      map.on('click', 'parking-zones-line', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') {
          // Stops the map's own click handler from also treating this as a
          // "tap on empty map" (which drops a pin in selection mode).
          e.preventDefault();
          onZoneClickRef.current?.(id);
        }
      });
      map.on('mouseenter', 'parking-zones-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'parking-zones-line', () => {
        map.getCanvas().style.cursor = '';
      });
    };

    if (map.isStyleLoaded()) {
      drawZones();
    } else {
      map.once('load', drawZones);
    }
  }, [zones]);

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
      // Untyped literal (rather than an explicit GeoJSON.* annotation) --
      // the global GeoJSON namespace isn't resolvable in this project's
      // tsconfig; mapboxgl's addSource/setData signatures accept this shape fine.
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: routeCoordinates ?? [],
        },
      };

      if (map.getSource('route')) {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(data);
      } else {
        if (!routeCoordinates) return;
        map.addSource('route', { type: 'geojson', data });
        // Composite line, Google-Maps style: a wider dark-navy casing under a
        // slightly thinner bright cyan/blue core reads as one crisp route at
        // any zoom, instead of a single flat line disappearing against the
        // basemap's own road/water colors. Casing added first so it paints
        // underneath.
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#0B3D6B', 'line-width': 9 },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2FA8FF', 'line-width': 5 },
        });
      }

      // Dashed core line marks the post-claim walking leg to a final POI so
      // it reads unmistakably as "on foot" against the solid driving route
      // that came before it; casing stays solid underneath either way.
      // [0, 2] with line-cap: 'round' is the standard Mapbox trick for a
      // dotted line -- each zero-length "dash" renders as a round dot.
      const dasharray = routeProfile === 'walking' ? [0, 2] : undefined;
      if (map.getLayer('route')) {
        map.setPaintProperty('route', 'line-dasharray', dasharray ?? null);
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
  }, [routeCoordinates, routeProfile]);

  // Google-Maps-style 3D chase camera while actively driving: pitched for
  // depth, bearing rotated to the driver's live heading so the route always
  // points "up" the way it does in a real turn-by-turn app. Only during
  // driving nav -- levels back out (pitch 0) the instant it ends or the
  // walking leg to a final POI takes over, since a tilted view makes no
  // sense for a short walk or for browsing the map freely.
  //
  // Skipped on the very first run: the camera restored from lastCamera (or
  // whatever the driver had rotated to before switching tabs) is theirs, and
  // a mount is not a navigation state change -- levelling it out here would
  // silently undo the orientation they chose.
  const prevNavStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const navState = `${isNavigating}:${routeProfile}`;
    if (prevNavStateRef.current === null) {
      prevNavStateRef.current = navState;
      return;
    }
    if (prevNavStateRef.current === navState) return;
    prevNavStateRef.current = navState;

    if (isNavigating && routeProfile === 'driving') {
      map.easeTo({ pitch: 55, duration: 800 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  }, [isNavigating, routeProfile]);

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });
  // Orientation button, as a toggle rather than a one-way reset.
  //
  // Pointing north is usually what someone wants -- but not always, and a
  // driver who rotated the map to match the street ahead of them shouldn't
  // lose that orientation permanently to a mistaken tap. So the first tap
  // remembers the bearing and snaps north; the next tap, if the map is still
  // north-up, puts the remembered bearing back.
  //
  // The reported "does nothing" case is the third one: north-up already,
  // with nothing remembered because the map has never been rotated. Rotating
  // needs a two-finger twist that most people never try, so that is the
  // common state. It now levels the pitch as well, which is a visible change
  // whenever the 3D driving camera has tilted the map -- and pitch is
  // exactly what a driver wants flattened when they reach for this button.
  const previousBearingRef = useRef(0);
  const handleResetNorth = () => {
    const map = mapRef.current;
    if (!map) return;
    const currentBearing = map.getBearing();

    // Not exactly 0: a bearing can settle a hair off after an animation, and
    // "0.4 degrees" should still count as facing north.
    const facingNorth = Math.abs(currentBearing) <= 0.5;

    if (!facingNorth) {
      previousBearingRef.current = currentBearing;
      map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
      return;
    }

    map.easeTo({ bearing: previousBearingRef.current, pitch: 0, duration: 400 });
  };

  /**
   * Location button. Lives here rather than in MapTab so it sits in the same
   * control column as zoom and the compass, and so it can reach the map
   * directly instead of round-tripping through a request counter.
   *
   * One path for every account: ask for real GPS, fly to the real fix. The
   * demo account used to be recentred on a simulated position instead, which
   * meant the button quietly did nothing useful for the one account most
   * likely to be demonstrating it.
   */
  const handleLocate = async () => {
    const map = mapRef.current;
    if (!map) return;

    // An explicit "take me to my position" also hands camera-following back
    // to the app until the driver pans away again.
    userMovedCameraRef.current = false;

    const flyTo = (lng: number, lat: number) =>
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), STREET_ZOOM), essential: true, speed: 1.4 });

    // Move immediately on the cached fix so the tap always feels like it did
    // something, then correct once a fresh one lands.
    const cached = getLastFix();
    if (cached) flyTo(cached.lng, cached.lat);

    setLocating(true);
    const fix = await requestFreshFix();
    setLocating(false);

    if (!fix) {
      // No cached position either means we never had one: nothing happened
      // on screen, so the driver needs to be told why.
      if (!cached) onLocateFailedRef.current?.();
      return;
    }
    setHasRealFix(true);
    onUserLocationChangeRef.current?.(fix.lng, fix.lat, fix.accuracy);
    flyTo(fix.lng, fix.lat);
  };

  const controlButton =
    'w-11 h-11 flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-secondary/70 active:scale-95 transition-all';

  return (
    <div className="absolute inset-0 w-full h-full">
      <div ref={containerRef} className="parkapp-map-shell absolute inset-0 w-full h-full" />

      {/* Map controls, bottom-right: zoom, orientation, locate, in one
          vertical column. Mapbox's own sat at y=10 underneath the floating
          search bar, which is why tapping them did nothing. bottom-64 is as
          low as this can go without colliding with the full-width bottom
          cards (destination info, spot/facility/zone sheets), which start
          around bottom-44 and are the one thing that must never be covered. */}
      <div className="absolute right-4 bottom-64 z-10 flex flex-col items-center gap-2">
        <div className="flex flex-col rounded-2xl overflow-hidden bg-background/90 backdrop-blur-md border border-border/60 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]">
          <button type="button" onClick={handleZoomIn} aria-label={t('map.zoomIn')} className={controlButton}>
            <Plus className="h-5 w-5" />
          </button>
          <div className="h-px bg-border/60 mx-2" />
          <button type="button" onClick={handleZoomOut} aria-label={t('map.zoomOut')} className={controlButton}>
            <Minus className="h-5 w-5" />
          </button>
        </div>

        {/* Shown only while the map is actually rotated or tilted.
            A compass whose whole job is "put the map back to north" has
            nothing to do when the map is already north-up and flat, and a
            button that cannot do anything reads as broken -- which is
            exactly how this one was reported. Google and Apple Maps hide
            theirs for the same reason. Rotating (two-finger twist) or
            starting turn-by-turn brings it back. */}
        {(Math.abs(bearing) > 0.5 || pitch > 0.5) && (
          <button
            type="button"
            onClick={handleResetNorth}
            aria-label={t('map.resetNorth')}
            className={`${controlButton} rounded-2xl bg-background/90 backdrop-blur-md border border-border/60 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] animate-fade-in`}
          >
            <Compass
              className="h-5 w-5 text-primary transition-transform duration-200"
              style={{ transform: `rotate(${-bearing}deg)` }}
            />
          </button>
        )}

        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          aria-label={t('map.myLocation')}
          className={`${controlButton} rounded-full bg-background/90 backdrop-blur-md border border-border/60 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] disabled:opacity-70`}
        >
          {locating ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <LocateFixed className="h-5 w-5 text-primary" />
          )}
        </button>
      </div>
    </div>
  );
};
