import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useNearbySpots } from '@/hooks/useNearbySpots';
import { declareSpot, claimSpot, manualUnpark } from '@/lib/api/parking';
import {
  Search,
  MapPin,
  Navigation,
  Eye,
  Loader2,
  X,
  AlertTriangle,
  Check,
  ParkingCircle,
  LocateFixed,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import chalkidaMap from '@/assets/chalkida-map.png';
import {
  MapboxMap,
  isMapboxConfigured,
  geocodeAddress,
  searchPlaces,
  retrievePlace,
  getDrivingDirections,
  snapToRoad,
  type PlaceSuggestion,
  type RouteStep,
} from './MapboxMap';
import { ConfettiBurst } from './ConfettiBurst';
import { SpotDetailsCard } from './SpotDetailsCard';

// The mocked GPS accuracy for demo declarations: comfortably inside any
// server-side accuracy gate so reviewers succeed from a desk anywhere.
const DEMO_ACCURACY_METERS = 5;

// Once the live GPS position gets this close to a maneuver point, the
// turn-by-turn banner advances to the next step.
const STEP_ADVANCE_RADIUS_METERS = 30;

// Slightly wider than STREET_ZOOM (17.5): a searched destination should
// still show its immediate surroundings -- parking options, cross streets --
// not fill the screen with just the one building.
const SEARCH_FLY_ZOOM = 16.5;

// Tighter than STREET_ZOOM: Map Selection Mode's manual pin drop needs a
// strict street-level view so a tap reliably lands on the road/curb instead
// of clipping the building it fronts.
const SELECTION_FLY_ZOOM = 18.5;

// "Is the spot free?" triggers once the driver is within this radius of the
// target spot -- close enough that they're plausibly right next to it, per
// the 50-100m range this MVP flow calls for.
const SPOT_PROXIMITY_METERS = 75;

type RouteState = 'idle' | 'searching' | 'found' | 'not_found';

interface Destination {
  name: string;
  lng: number;
  lat: number;
}

interface RouteTotals {
  distanceMeters: number;
  durationSeconds: number;
}

const MOCK_DESTINATIONS = {
  mikel: { name: 'Mikel Coffee', x: 55, y: 35 },
  sklavenitis: { name: 'Sklavenitis', x: 70, y: 50 },
  public: { name: 'Public Karystos', x: 52, y: 48 },
};

// Fallback center (Karystos, Greece -- the live pilot/demo city) used
// whenever real geolocation isn't available (denied permission, desktop
// demo browser, etc).
const MAP_CENTER: [number, number] = [24.4167, 38.0167];

function percentToLngLat(x: number, y: number): [number, number] {
  const lng = MAP_CENTER[0] + ((x - 50) / 50) * 0.01;
  const lat = MAP_CENTER[1] - ((y - 50) / 50) * 0.008;
  return [lng, lat];
}

function lngLatToPercent(lng: number, lat: number): { x: number; y: number } {
  const x = 50 + ((lng - MAP_CENTER[0]) / 0.01) * 50;
  const y = 50 - ((lat - MAP_CENTER[1]) / 0.008) * 50;
  return { x, y };
}

function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// A guaranteed fresh, one-off GPS fix -- unlike the position tracked in
// state (which only updates whenever GeolocateControl happens to have last
// fired), this is captured at the exact moment the driver taps "Emptying a
// space", right where they're actually standing. Resolves null (never
// rejects) on any failure -- no geolocation API, permission denied, or a
// dead zone with no fix in time -- so callers can fall back to state.
function getFreshPosition(): Promise<{ lng: number; lat: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
    );
  });
}

function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// Maps a Mapbox Directions maneuver to a Google-Maps-style arrow icon.
function ManeuverIcon({ type, modifier, className }: { type: string; modifier?: string; className?: string }) {
  if (type === 'arrive') return <Flag className={className} />;
  if (modifier === 'uturn') return <RotateCcw className={className} />;
  if (modifier?.includes('left')) return <CornerUpLeft className={className} />;
  if (modifier?.includes('right')) return <CornerUpRight className={className} />;
  return <ArrowUp className={className} />;
}

interface MapTabProps {
  onNavigateToPlans?: () => void;
  onNavigateToOffers?: () => void;
}

export const MapTab = ({ onNavigateToPlans, onNavigateToOffers }: MapTabProps) => {
  const { incrementSearches } = useApp();
  const { profile, isDemoAccount } = useAuth();
  const { t, language } = useLanguage();
  const { activeSession, refetch: refetchSession } = useActiveSession();
  const nearbySpots = useNearbySpots();

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [routeState, setRouteState] = useState<RouteState>('idle');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [activeDestination, setActiveDestination] = useState<Destination | null>(null);
  const [routeTotals, setRouteTotals] = useState<RouteTotals | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[] | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [walkMinutes, setWalkMinutes] = useState<number>(2);
  const [busyAction, setBusyAction] = useState<'declare' | 'spotted' | 'claim' | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [locateRequestId, setLocateRequestId] = useState(0);

  // Smart parking routing: when a search resolves to a POI, the actual
  // route/main pin target is the nearest available parking spot to it, not
  // the POI's front door -- poiMarker keeps the original place as a smaller
  // secondary pin, targetSpotId is which parking_spots row navigation is
  // currently pointed at (claimed by the "Yes, I Parked" prompt, swapped out
  // by "No, Find Next"), and excludedSpotIds accumulates spots already
  // rejected for the current destination so "find next" never repeats one.
  const [poiMarker, setPoiMarker] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [targetSpotId, setTargetSpotId] = useState<string | null>(null);
  const [excludedSpotIds, setExcludedSpotIds] = useState<string[]>([]);
  const [showSpotPrompt, setShowSpotPrompt] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  // "I saw a free space" (white button) enters this mode: the next map tap
  // drops a temporary yellow pin instead of declaring immediately, so the
  // reporter can mark a spot they saw elsewhere rather than under their feet.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<{ lng: number; lat: number } | null>(null);

  // Shown the instant a declaration succeeds, right on the GPS coordinates
  // it was submitted at -- realtime's own round trip (write -> postgres_changes
  // -> useNearbySpots refetch) is fast but not instant, and the driver
  // shouldn't see a blank map in the meantime. Cleared once the real spot
  // (matched by owner + proximity) shows up in nearbySpots.
  const [optimisticSpot, setOptimisticSpot] = useState<{ lng: number; lat: number } | null>(null);

  // Bottom card opened by tapping a live "mine"/"reported" spot pin --
  // holds the id so the card's live distance/ETA can recompute against the
  // driver's current position rather than a snapshot from the moment of the tap.
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Bumped by both action buttons to imperatively fly/zoom the camera to
  // street level centered on the user, right before a manual tap or an
  // automatic declaration -- see MapboxMap's flyToRequestId effect.
  const [flyToRequestId, setFlyToRequestId] = useState(0);
  const [flyToTarget, setFlyToTarget] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);
  const flyToLocation = (lng: number, lat: number, zoom?: number) => {
    setFlyToTarget({ lng, lat, zoom });
    setFlyToRequestId((n) => n + 1);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);
  // Set right before we programmatically fill the search box with a chosen
  // suggestion's full name, so that text change doesn't re-trigger the
  // autocomplete effect and pop the dropdown back open over the selection.
  const suppressNextAutocompleteRef = useRef(false);
  // Groups every keystroke of one search plus its eventual selection under a
  // single Search Box API session (their billing/relevance model), then
  // rotates to a fresh one for the next search.
  const sessionTokenRef = useRef<string>(crypto.randomUUID());

  // Real device position; falls back to the demo city center if unavailable.
  const [userLngLat, setUserLngLat] = useState<[number, number]>(MAP_CENTER);
  const [userAccuracy, setUserAccuracy] = useState<number>(9999);

  // Mirrors userLngLat without being a search-debounce dependency -- reading
  // this instead of the state directly means proximity-biasing search picks
  // up the latest known GPS fix on every keystroke without re-running (and
  // re-debouncing) the whole autocomplete effect on every GPS tick.
  const userLngLatRef = useRef(userLngLat);
  useEffect(() => {
    userLngLatRef.current = userLngLat;
  }, [userLngLat]);

  useEffect(() => {
    if (isDemoAccount) {
      // Demo reviewers judge from a desk, not a car: skip real geolocation
      // entirely and pretend the device is at the map center with perfect
      // accuracy. Real accounts get their position from MapboxMap's own
      // GeolocateControl instead (see handleUserLocationChange below).
      setUserAccuracy(DEMO_ACCURACY_METERS);
    }
  }, [isDemoAccount]);

  // Demo only: the "user" follows the map, so wherever the reviewer pans,
  // that's where their declarations land.
  const handleCenterChange = useCallback(
    (lng: number, lat: number) => {
      if (isDemoAccount) setUserLngLat([lng, lat]);
    },
    [isDemoAccount]
  );

  // Real accounts only: MapboxMap's GeolocateControl prompts for permission
  // on mount and calls this on every live GPS fix, so userLngLat always
  // reflects the actual device position rather than a one-time snapshot.
  const handleUserLocationChange = useCallback(
    (lng: number, lat: number, accuracy: number) => {
      if (isDemoAccount) return;
      setUserLngLat([lng, lat]);
      setUserAccuracy(accuracy);
    },
    [isDemoAccount]
  );

  // "My Location" button: bumps a counter MapboxMap watches to re-trigger
  // GeolocateControl (permission prompt + fresh fix + camera fly-to), reusing
  // the exact same tested path the auto-trigger-on-mount already uses.
  const handleLocateMe = () => {
    setLocateRequestId((n) => n + 1);
  };

  // Live autocomplete: debounce keystrokes, ignore stale responses that
  // resolve out of order.
  useEffect(() => {
    if (suppressNextAutocompleteRef.current) {
      suppressNextAutocompleteRef.current = false;
      return;
    }
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      // Box is empty again -- next input starts a new search session.
      sessionTokenRef.current = crypto.randomUUID();
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timer = setTimeout(async () => {
      // Biased toward wherever the driver actually is right now, not the
      // fallback Karystos map center -- a "pharmacy" search from a different
      // town should surface that town's pharmacies first, not Athens'.
      const results = await searchPlaces(searchQuery, userLngLatRef.current, sessionTokenRef.current);
      if (searchRequestIdRef.current === requestId) setSuggestions(results);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Drop the optimistic pin once the real, server-written spot has arrived
  // through useNearbySpots' realtime subscription -- matched by ownership
  // and proximity rather than id, since the optimistic pin never has the
  // real row's id.
  useEffect(() => {
    if (!optimisticSpot || !profile?.id) return;
    const arrived = nearbySpots.some(
      (s) =>
        s.declared_by === profile.id &&
        distanceMeters(s.lng, s.lat, optimisticSpot.lng, optimisticSpot.lat) < 20
    );
    if (arrived) setOptimisticSpot(null);
  }, [nearbySpots, optimisticSpot, profile?.id]);

  // Turn-by-turn step advancement: once the live position gets close enough
  // to the current maneuver point, move on to the next instruction.
  useEffect(() => {
    if (!routeSteps || routeSteps.length === 0) return;
    if (currentStepIndex >= routeSteps.length - 1) return;
    const step = routeSteps[currentStepIndex];
    const d = distanceMeters(userLngLat[0], userLngLat[1], step.maneuverLocation[0], step.maneuverLocation[1]);
    if (d < STEP_ADVANCE_RADIUS_METERS) {
      setCurrentStepIndex((i) => Math.min(i + 1, routeSteps.length - 1));
    }
  }, [userLngLat, routeSteps, currentStepIndex]);

  // "Is the spot free?" -- triggers once the live position is close enough
  // to the current target spot. Stays up once shown (rather than hiding
  // again if the driver circles the block) until answered via one of the
  // prompt's two actions.
  useEffect(() => {
    if (!targetSpotId || !activeDestination || showSpotPrompt) return;
    const d = distanceMeters(userLngLat[0], userLngLat[1], activeDestination.lng, activeDestination.lat);
    if (d <= SPOT_PROXIMITY_METERS) {
      setShowSpotPrompt(true);
    }
  }, [userLngLat, targetSpotId, activeDestination, showSpotPrompt]);

  // The actual parking value-add: given a searched POI, find the nearest
  // reported-active spot to it (never the driver's own declaration -- that's
  // for other drivers) so navigation and the main pin point at somewhere to
  // actually park, not the POI's front door. Falls back to the POI itself
  // when nothing's been reported near it yet, so the flow still works with
  // sparse pilot-stage data instead of failing outright.
  function findNearestSpotTo(point: { lng: number; lat: number }, excludeIds: string[]) {
    const excluded = new Set(excludeIds);
    const candidates = nearbySpots.filter(
      (s) => s.declared_by !== profile?.id && s.status === 'active' && !excluded.has(s.id)
    );
    return candidates.reduce<{ id: string; lng: number; lat: number; d: number } | null>((best, s) => {
      const d = distanceMeters(point.lng, point.lat, s.lng, s.lat);
      if (!best || d < best.d) return { id: s.id, lng: s.lng, lat: s.lat, d };
      return best;
    }, null);
  }

  const runDestinationSearch = async (poi: Destination) => {
    const canSearch = incrementSearches();
    if (!canSearch) {
      setShowLimitModal(true);
      return;
    }

    setRouteState('searching');
    setRouteTotals(null);
    setRouteCoords(null);
    setRouteSteps(null);
    setCurrentStepIndex(0);
    setPoiMarker(null);
    setTargetSpotId(null);
    setExcludedSpotIds([]);
    setShowSpotPrompt(false);
    setIsRouting(false);

    // Route from exactly where the driver is right now, not a fix that
    // might be stale by however long since GeolocateControl last updated
    // it -- same guaranteed-fresh capture "Emptying a space" uses. Demo
    // accounts keep their simulated map-center position.
    let origin = userLngLat;
    if (!isDemoAccount) {
      const fresh = await getFreshPosition();
      if (fresh) {
        origin = [fresh.lng, fresh.lat];
        setUserLngLat(origin);
        setUserAccuracy(fresh.accuracy);
      }
    }

    const closest = findNearestSpotTo(poi, []);
    const destination: Destination = closest ? { name: poi.name, lng: closest.lng, lat: closest.lat } : poi;
    setActiveDestination(destination);
    if (closest) {
      setPoiMarker({ lng: poi.lng, lat: poi.lat, name: poi.name });
      setTargetSpotId(closest.id);
      setWalkMinutes(walkingMinutes(closest.d));
    }

    const directions = await getDrivingDirections(
      origin,
      [destination.lng, destination.lat],
      language === 'gr' ? 'el' : 'en'
    );
    if (directions) {
      setRouteCoords(directions.coordinates);
      setRouteSteps(directions.steps.length > 0 ? directions.steps : null);
      setRouteTotals({ distanceMeters: directions.distanceMeters, durationSeconds: directions.durationSeconds });
      setIsRouting(true);
    } else {
      toast({ title: t('map.routeUnavailable'), variant: 'destructive' });
    }

    if (closest) {
      setRouteState('found');
      toast({ title: t('map.spotFoundToast'), description: t('map.walkFromDest', { n: walkingMinutes(closest.d) }) });
    } else {
      setRouteState('not_found');
    }
  };

  // Routes turn-by-turn directions to the exact lat/lng of a parking spot
  // pin (never a store/destination address) -- used right after a
  // successful claim so "Navigate" always means "get me to the spot I just
  // locked in", reusing the same tested Mapbox Directions path as a normal
  // destination search, just without its search-quota/nearby-spot lookup.
  const navigateToSpotPin = async (spot: { lng: number; lat: number }) => {
    const destination: Destination = { name: t('map.yourClaimedSpot'), lng: spot.lng, lat: spot.lat };
    setRouteState('searching');
    setActiveDestination(destination);
    setRouteTotals(null);
    setRouteCoords(null);
    setRouteSteps(null);
    setCurrentStepIndex(0);
    setPoiMarker(null);
    setTargetSpotId(null);

    const directions = await getDrivingDirections(userLngLat, [spot.lng, spot.lat], language === 'gr' ? 'el' : 'en');
    if (directions) {
      setRouteCoords(directions.coordinates);
      setRouteSteps(directions.steps.length > 0 ? directions.steps : null);
      setRouteTotals({ distanceMeters: directions.distanceMeters, durationSeconds: directions.durationSeconds });
      setRouteState('found');
      setIsRouting(true);
    } else {
      setRouteState('idle');
      setActiveDestination(null);
      toast({ title: t('map.routeUnavailable'), variant: 'destructive' });
    }
  };

  const handleSelectSuggestion = async (place: PlaceSuggestion) => {
    setSuggestions([]);
    suppressNextAutocompleteRef.current = true;
    setSearchQuery(place.name);
    inputRef.current?.blur();

    // Suggestions never carry coordinates (Search Box API design) -- resolve
    // them with the same session token the suggest call used, then rotate to
    // a fresh token since this search session is now over.
    const sessionToken = sessionTokenRef.current;
    sessionTokenRef.current = crypto.randomUUID();
    const resolved = await retrievePlace(place.id, sessionToken);
    if (!resolved) {
      toast({ title: t('map.locationNotFound'), description: t('map.locationNotFoundDesc'), variant: 'destructive' });
      return;
    }

    // Fly the camera there immediately, in the same tick coordinates
    // resolve -- doesn't wait on the directions round trip runDestinationSearch
    // still does below for the actual route/nearest-spot lookup.
    flyToLocation(resolved.lng, resolved.lat, SEARCH_FLY_ZOOM);
    await runDestinationSearch({ name: place.name, lng: resolved.lng, lat: resolved.lat });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({ title: t('map.enterDestination'), description: t('map.enterDestinationDesc'), variant: 'destructive' });
      return;
    }

    if (suggestions.length > 0) {
      await handleSelectSuggestion(suggestions[0]);
      return;
    }

    setRouteState('searching');
    let destination: Destination | null = null;

    if (isMapboxConfigured) {
      const result = await geocodeAddress(searchQuery, userLngLatRef.current);
      if (!result) {
        setRouteState('idle');
        toast({ title: t('map.locationNotFound'), description: t('map.locationNotFoundDesc'), variant: 'destructive' });
        return;
      }
      destination = result;
      flyToLocation(result.lng, result.lat, SEARCH_FLY_ZOOM);
    } else {
      const queryLower = searchQuery.toLowerCase();
      const mock = Object.entries(MOCK_DESTINATIONS).find(
        ([key]) => queryLower.includes(key) || key.includes(queryLower)
      )?.[1] ?? { name: searchQuery, x: 60, y: 40 };
      const [lng, lat] = percentToLngLat(mock.x, mock.y);
      destination = { name: mock.name, lng, lat };
    }

    await runDestinationSearch(destination);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearRoute = () => {
    setRouteState('idle');
    setActiveDestination(null);
    setPoiMarker(null);
    setTargetSpotId(null);
    setExcludedSpotIds([]);
    setShowSpotPrompt(false);
    setIsRouting(false);
    setRouteTotals(null);
    setRouteCoords(null);
    setRouteSteps(null);
    setCurrentStepIndex(0);
    setSearchQuery('');
    setSuggestions([]);
  };

  // "Yes, I Parked" -- claims the target spot right where the driver is
  // standing and ends navigation. Reuses the same claimSpot call the
  // top-right "Claim nearest" banner uses, just against this specific
  // targeted spot instead of whichever is nearest to the driver overall.
  const handleSpotConfirmedFree = async () => {
    if (!targetSpotId) return;
    setBusyAction('claim');
    const [lng, lat] = userLngLat;
    const { data, error } = await claimSpot({ spotId: targetSpotId, userLat: lat, userLng: lng, accuracy: userAccuracy });
    if (error) {
      toast({ title: t('map.claimFailed'), description: error, variant: 'destructive' });
    } else if (data) {
      toast({ title: t('map.claimedToast'), description: t('map.claimedToastDesc') });
      await refetchSession();
    }
    setBusyAction(null);
    clearRoute();
  };

  // "No, Find Next" -- excludes the current spot, finds the next-closest
  // active spot to the *original* POI (poiMarker, not wherever the driver
  // is now), and instantly redraws the route to it.
  const handleFindNextSpot = async () => {
    if (!poiMarker || !targetSpotId) return;
    const excluded = [...excludedSpotIds, targetSpotId];
    setExcludedSpotIds(excluded);
    setShowSpotPrompt(false);

    const next = findNearestSpotTo(poiMarker, excluded);
    if (!next) {
      toast({ title: t('map.noMoreSpots'), description: t('map.noMoreSpotsDesc'), variant: 'destructive' });
      setTargetSpotId(null);
      return;
    }

    setTargetSpotId(next.id);
    setWalkMinutes(walkingMinutes(next.d));
    setActiveDestination({ name: poiMarker.name, lng: next.lng, lat: next.lat });
    setRouteState('searching');

    const directions = await getDrivingDirections(userLngLat, [next.lng, next.lat], language === 'gr' ? 'el' : 'en');
    if (directions) {
      setRouteCoords(directions.coordinates);
      setRouteSteps(directions.steps.length > 0 ? directions.steps : null);
      setRouteTotals({ distanceMeters: directions.distanceMeters, durationSeconds: directions.durationSeconds });
      setRouteState('found');
      flyToLocation(next.lng, next.lat, SEARCH_FLY_ZOOM);
    } else {
      toast({ title: t('map.routeUnavailable'), variant: 'destructive' });
      setRouteState('found');
    }
  };

  // "I'm leaving" -- declares the current spot free (right where the live
  // GPS/GeolocateControl says the user is standing) and, if the user had an
  // active claimed session, closes it with the honest-checkout bonus too.
  const handleDeclare = async () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedSpot(null);
    }
    setBusyAction('declare');

    // No manual pin drop for this button -- capture exactly where the
    // driver is standing right now and submit directly at those coordinates.
    // Demo accounts keep their simulated map-center position; real accounts
    // get a guaranteed-fresh fix instead of trusting a possibly-stale one
    // cached from GeolocateControl's last update.
    let [lng, lat] = userLngLat;
    let accuracy = userAccuracy;
    if (!isDemoAccount) {
      const fresh = await getFreshPosition();
      if (fresh) {
        lng = fresh.lng;
        lat = fresh.lat;
        accuracy = fresh.accuracy;
        setUserLngLat([lng, lat]);
        setUserAccuracy(accuracy);
      } else if (accuracy >= 9999) {
        // 9999 is userAccuracy's initial sentinel (see useState above) --
        // reaching it here means neither this fresh attempt nor
        // GeolocateControl has EVER produced a real fix (permission denied,
        // no signal, desktop with no GPS). Previously this silently fell
        // through and submitted at userLngLat's own initial value --
        // MAP_CENTER, the hardcoded map fallback -- which looks like "the
        // pin always drops at the same wrong spot" rather than wherever the
        // driver actually is. Fail loudly instead of guessing a location.
        toast({ title: t('map.noGpsTitle'), description: t('map.noGpsDesc'), variant: 'destructive' });
        setBusyAction(null);
        return;
      }
    }

    flyToLocation(lng, lat);

    // True optimistic UI: paint the pin the instant the request goes out,
    // not only once the server confirms it -- rolled back below if the call
    // fails (e.g. a network drop mid-submit), so the map never keeps
    // showing a spot that was never actually saved.
    setOptimisticSpot({ lng, lat });

    const { data, error } = await declareSpot({
      spotLat: lat,
      spotLng: lng,
      userLat: lat,
      userLng: lng,
      accuracy,
      kind: 'vacating',
    });

    if (error) {
      setOptimisticSpot(null);
      toast({ title: t('map.declareFailed'), description: error, variant: 'destructive' });
    } else if (data) {
      if (isDemoAccount) {
        setCelebrating(true);
        toast({
          title: t('map.demoDeclareTitle', { n: data.pointsAwarded }),
          description: t('map.demoDeclareDesc'),
        });
      } else {
        toast({ title: t('map.thanksPoints', { n: data.pointsAwarded }), description: t('map.thanksPointsDesc') });
      }
    }

    if (activeSession) {
      const unparkResult = await manualUnpark();
      if (unparkResult.data) {
        await refetchSession();
      }
    }
    setBusyAction(null);
  };

  // Toggles Map Selection Mode: the reviewer taps anywhere on the map to
  // drop a temporary pin, then confirms it from the floating button that
  // appears right above that pin.
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedSpot(null);
      return;
    }
    setSelectionMode(true);
    setSelectedSpot(null);
    setSelectedSpotId(null);
    flyToLocation(userLngLat[0], userLngLat[1], SELECTION_FLY_ZOOM);
    toast({ title: t('map.selectionModeTitle'), description: t('map.selectionModeDesc') });
  };

  // Places the temporary pin immediately at the tapped point so the tap
  // feels responsive, then snaps it onto the nearest real street the moment
  // the Map Matching lookup resolves -- the same road-snap Mapbox call
  // declare-spot's Edge Function uses server-side, just run client-side
  // first for instant visual feedback instead of finding out after submit.
  const handleMapTap = async (lng: number, lat: number) => {
    if (!selectionMode) return;
    setSelectedSpot({ lng, lat });
    const snapped = await snapToRoad(lng, lat);
    if (snapped) setSelectedSpot(snapped);
  };

  const handleConfirmSelection = async () => {
    if (!selectedSpot) return;
    setBusyAction('spotted');
    const [userLng, userLat] = userLngLat;
    const { data, error } = await declareSpot({
      spotLat: selectedSpot.lat,
      spotLng: selectedSpot.lng,
      userLat,
      userLng,
      accuracy: userAccuracy,
      kind: 'spotted',
    });
    if (error) {
      // Keep selectionMode/selectedSpot as they are on failure -- the pin
      // the driver just placed stays visible and Confirm is still right
      // there to retry, instead of silently vanishing and forcing a re-drop.
      toast({ title: t('map.reportFailed'), description: error, variant: 'destructive' });
      setBusyAction(null);
      return;
    }
    if (data) {
      // Hand off from the temporary "selection" pin straight to the
      // optimistic "mine" pin at the same coordinates, so there's no gap
      // where neither is showing while realtime catches up with the real row.
      setOptimisticSpot({ lng: selectedSpot.lng, lat: selectedSpot.lat });
      if (isDemoAccount) {
        setCelebrating(true);
        toast({
          title: t('map.demoReportTitle', { n: data.pointsAwarded }),
          description: t('map.demoReportDesc'),
        });
      } else {
        toast({ title: t('map.reportedPoints', { n: data.pointsAwarded }), description: t('map.reportedPointsDesc') });
      }
    }
    setSelectionMode(false);
    setSelectedSpot(null);
    setBusyAction(null);
  };

  // Tapping a live "mine"/"reported" spot pin opens the details bottom card
  // (distance/time-since/ETA + Get Directions) -- see MapboxMap's onPinClick.
  const handlePinClick = (pinId: string) => {
    setSelectedSpotId(pinId);
  };
  const clickedNearbySpot = nearbySpots.find((s) => s.id === selectedSpotId) ?? null;

  // "Get Directions" on the details card -- reuses navigateToSpotPin
  // verbatim, the exact same turn-by-turn routing path (Mapbox Directions
  // API via getDrivingDirections) the search bar's own destination flow
  // already goes through, just pointed straight at this specific pin
  // instead of the nearest-spot-to-a-searched-POI lookup.
  const handleGetDirectionsFromPin = async () => {
    if (!clickedNearbySpot) return;
    const { lng, lat } = clickedNearbySpot;
    setSelectedSpotId(null);
    await navigateToSpotPin({ lng, lat });
  };

  const handleStaticMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const [lng, lat] = percentToLngLat(xPct, yPct);
    handleMapTap(lng, lat);
  };

  const nearestClaimable = nearbySpots
    .filter((s) => s.declared_by !== profile?.id)
    .map((s) => ({ ...s, d: distanceMeters(userLngLat[0], userLngLat[1], s.lng, s.lat) }))
    .sort((a, b) => a.d - b.d)[0];

  const handleClaimNearest = async () => {
    if (!nearestClaimable) return;
    setBusyAction('claim');
    const [lng, lat] = userLngLat;
    const { data, error } = await claimSpot({
      spotId: nearestClaimable.id,
      userLat: lat,
      userLng: lng,
      accuracy: userAccuracy,
    });
    if (error) {
      toast({ title: t('map.claimFailed'), description: error, variant: 'destructive' });
    } else if (data) {
      toast({ title: t('map.claimedToast'), description: t('map.claimedToastDesc') });
      await refetchSession();
      await navigateToSpotPin({ lng: nearestClaimable.lng, lat: nearestClaimable.lat });
    }
    setBusyAction(null);
  };

  const isNavigating = Boolean(activeDestination && routeSteps && routeSteps.length > 0);
  const currentStep = routeSteps?.[currentStepIndex] ?? null;

  // Remaining distance/ETA is the sum of the not-yet-passed steps once we
  // have them; falls back to the whole-route total on the rare route that
  // came back with no steps at all.
  const remaining: RouteTotals | null = routeSteps && routeSteps.length > 0
    ? routeSteps.slice(currentStepIndex).reduce(
        (acc, s) => ({ distanceMeters: acc.distanceMeters + s.distanceMeters, durationSeconds: acc.durationSeconds + s.durationSeconds }),
        { distanceMeters: 0, durationSeconds: 0 }
      )
    : routeTotals;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {isMapboxConfigured ? (
        <MapboxMap
          center={MAP_CENTER}
          userLocation={userLngLat}
          // The demo mock dot only ever meant "here's the point a manual pin
          // drop will use" -- now that only "I saw a free space" drops a
          // manual pin, the dot has no reason to show outside that mode.
          showCustomUserDot={isDemoAccount && selectionMode}
          onUserLocationChange={handleUserLocationChange}
          locateRequestId={locateRequestId}
          flyToTarget={flyToTarget}
          flyToRequestId={flyToRequestId}
          onPinClick={handlePinClick}
          pins={[
            ...nearbySpots.map((s) => ({
              id: s.id,
              lng: s.lng,
              lat: s.lat,
              type: (s.declared_by === profile?.id ? 'mine' : 'reported') as 'mine' | 'reported',
              label: s.declared_by === profile?.id ? 'Your declared spot' : 'Reported free space',
            })),
            ...(optimisticSpot
              ? [{ id: 'optimistic-mine', lng: optimisticSpot.lng, lat: optimisticSpot.lat, type: 'mine' as const, label: 'Your declared spot' }]
              : []),
            ...(activeDestination
              ? [{ id: 'destination', lng: activeDestination.lng, lat: activeDestination.lat, type: 'destination' as const, label: activeDestination.name }]
              : []),
            // Smaller secondary pin: the actual searched POI, once the main
            // "destination" pin above has been swapped to point at the
            // nearest parking spot instead.
            ...(poiMarker
              ? [{ id: 'poi', lng: poiMarker.lng, lat: poiMarker.lat, type: 'poi' as const, label: poiMarker.name }]
              : []),
            ...(selectedSpot
              ? [{ id: 'selection', lng: selectedSpot.lng, lat: selectedSpot.lat, type: 'selection' as const }]
              : []),
          ]}
          onMapClick={handleMapTap}
          onCenterChange={handleCenterChange}
          onConfirmSelection={handleConfirmSelection}
          routeCoordinates={routeCoords}
        />
      ) : (
        <div ref={imageContainerRef} className="absolute inset-0" onClick={handleStaticMapClick}>
          <img src={chalkidaMap} alt="Karystos Map" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Overlay pins for the static fallback map only -- MapboxMap renders its own markers. */}
      {!isMapboxConfigured && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {(() => {
            const userPct = lngLatToPercent(userLngLat[0], userLngLat[1]);
            return (
              <div className="absolute transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${userPct.x}%`, top: `${userPct.y}%` }}>
                <div className="relative">
                  <div className="absolute inset-0 w-8 h-8 -m-2 rounded-full bg-primary/30 animate-ping" />
                  <div className="absolute inset-0 w-6 h-6 -m-1 rounded-full bg-primary/50" />
                  <div className="w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg" />
                </div>
              </div>
            );
          })()}

          {nearbySpots.map((spot) => {
            const pct = lngLatToPercent(spot.lng, spot.lat);
            const mine = spot.declared_by === profile?.id;
            return (
              <div
                key={spot.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-fade-in"
                style={{ left: `${pct.x}%`, top: `${pct.y}%` }}
              >
                <div className={`w-4 h-4 rounded-full border-2 border-white shadow-lg ${mine ? 'bg-success' : 'bg-primary'}`} />
              </div>
            );
          })}

          {activeDestination && routeState !== 'idle' && (() => {
            const pct = lngLatToPercent(activeDestination.lng, activeDestination.lat);
            return (
              <div className="absolute transform -translate-x-1/2 -translate-y-full" style={{ left: `${pct.x}%`, top: `${pct.y}%` }}>
                <div className="flex flex-col items-center">
                  <div className="bg-destructive text-destructive-foreground px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1 whitespace-nowrap max-w-[160px] truncate">
                    {activeDestination.name}
                  </div>
                  <MapPin className="h-8 w-8 text-destructive drop-shadow-lg" fill="currentColor" />
                </div>
              </div>
            );
          })()}

          {poiMarker && routeState === 'found' && (() => {
            const pct = lngLatToPercent(poiMarker.lng, poiMarker.lat);
            return (
              <div className="absolute transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct.x}%`, top: `${pct.y}%` }}>
                <div className="relative">
                  <div className="absolute inset-0 w-12 h-12 -m-4 rounded-full bg-success/40 animate-pulse" />
                  <div className="w-4 h-4 rounded-sm bg-success border-2 border-white shadow-lg rotate-45" />
                </div>
              </div>
            );
          })()}

          {selectedSpot && (() => {
            const pct = lngLatToPercent(selectedSpot.lng, selectedSpot.lat);
            return (
              <div
                className="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center gap-1.5 pointer-events-auto"
                style={{ left: `${pct.x}%`, top: `${pct.y}%` }}
              >
                <Button size="sm" className="rounded-full shadow-lg text-xs h-8" onClick={handleConfirmSelection}>
                  {t('map.confirmSpot')}
                </Button>
                <div className="w-4 h-4 rounded-sm bg-warning border-2 border-white shadow-lg rotate-45" />
              </div>
            );
          })()}
        </div>
      )}

      {/* Header: turn-by-turn maneuver banner while navigating, search bar otherwise.
          The outer strip is pointer-events-none so its padding never blocks the
          Mapbox controls underneath -- only the actual card/input is clickable. */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-6 pointer-events-none">
        {isNavigating && currentStep ? (
          <div className="glass-card p-4 shadow-2xl bg-primary text-primary-foreground rounded-2xl flex items-center gap-3 pointer-events-auto animate-fade-in">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ManeuverIcon type={currentStep.maneuverType} modifier={currentStep.maneuverModifier} className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base leading-tight">{formatDistance(currentStep.distanceMeters)}</p>
              <p className="text-sm text-primary-foreground/85 truncate">{currentStep.instruction}</p>
            </div>
          </div>
        ) : (
          <div className="relative pointer-events-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
              disabled={routeState === 'searching'}
              placeholder={t('map.searchPlaceholder')}
              className="w-full h-14 pl-12 pr-16 text-base rounded-2xl shadow-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button
              onClick={handleSearch}
              disabled={routeState === 'searching'}
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
            >
              {routeState === 'searching' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </Button>

            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 glass-card p-1 max-h-64 overflow-y-auto z-30 animate-fade-in">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(s);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-secondary/70 transition-colors flex items-center gap-2"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{s.name}</span>
                      {s.address && <span className="block text-xs text-muted-foreground truncate">{s.address}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Points Pill -- faded out (not just visually behind) while the search
          dropdown is open: they occupy the same top-left corner, and at
          z-20 both the pill sat in front of and overlapped the dropdown's
          top rows, making those results unreadable. Fades back in the
          instant the dropdown closes, whether from a selection or clearing
          the search box, since both already empty `suggestions`. */}
      <div
        className={`absolute top-24 left-4 z-20 transition-opacity duration-200 ${
          suggestions.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        data-tour="points"
      >
        <button
          type="button"
          onClick={() => onNavigateToOffers?.()}
          aria-label={`${profile?.points_balance ?? 0} ${t('map.points')} — ${t('nav.offers')}`}
          className="points-pill flex items-center gap-2 cursor-pointer transition-transform active:scale-95 hover:brightness-110"
        >
          <span>💎</span>
          <span>{profile?.points_balance ?? 0} {t('map.points')}</span>
        </button>
      </div>

      {/* Claimable spot banner -- pushed down clear of Mapbox's own top-right
          control stack (NavigationControl's 3 zoom/compass buttons +
          GeolocateControl, offset 5rem by the CSS in index.css to clear the
          search bar, together spanning roughly 80-200px): top-24 (96px) sat
          right inside that range and was covering the compass/geolocate
          buttons. top-56 (224px) clears the full stack with margin to spare.
          Also fades out alongside the Points pill during search/autocomplete
          -- both occupy prime real estate the dropdown needs, and a floating
          green button over search results was just as much a problem as the
          Points pill overlapping them. */}
      {!activeSession && nearestClaimable && (
        <div
          className={`absolute top-56 right-4 z-20 transition-opacity duration-200 ${
            suggestions.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <Button
            onClick={handleClaimNearest}
            disabled={busyAction === 'claim'}
            size="sm"
            className="rounded-full shadow-lg gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
          >
            {busyAction === 'claim' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ParkingCircle className="h-3.5 w-3.5" />}
            {t('map.claimNearest')}
          </Button>
        </div>
      )}

      {/* My Location -- real accounts only; demo intentionally never touches real GPS. */}
      {!isDemoAccount && (
        <button
          onClick={handleLocateMe}
          aria-label={t('map.myLocation')}
          className="absolute bottom-60 right-4 z-20 w-11 h-11 rounded-full bg-background shadow-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <LocateFixed className="h-5 w-5 text-primary" />
        </button>
      )}

      {/* Map Selection Mode banner */}
      {selectionMode && (
        <div className="absolute top-40 left-4 right-4 z-20 flex justify-center">
          <div className="glass-card px-4 py-2.5 flex items-center gap-3 shadow-lg animate-fade-in">
            <span className="text-xs font-medium">{t('map.selectionBannerText')}</span>
            <button
              onClick={handleToggleSelectionMode}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t('profile.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Central Check-out + Secondary "I saw a free space" buttons. Map
          Selection Mode always replaces them with a Cancel/Confirm pair
          (even mid-route -- placing a manual pin needs the reviewer's full
          attention regardless). Otherwise, while isRouting, these collapse
          into small icon-only FABs on the mid-left edge instead of the full
          bottom bar, so turn-by-turn navigation isn't fighting the map for
          screen space -- reporting is still one tap away, just decluttered. */}
      {selectionMode ? (
        <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-center gap-4 px-4" data-tour="actions">
          <button
            onClick={handleToggleSelectionMode}
            disabled={busyAction !== null}
            aria-label={t('map.cancelSelection')}
            className="w-14 h-14 rounded-full shadow-xl bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="h-6 w-6 text-white" strokeWidth={2.5} />
          </button>
          <Button
            onClick={handleConfirmSelection}
            disabled={busyAction !== null || !selectedSpot}
            className="h-14 rounded-full px-6 shadow-xl gap-2 font-semibold bg-primary hover:bg-primary/90"
          >
            {busyAction === 'spotted' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {t('map.confirmSpot')}
          </Button>
        </div>
      ) : clickedNearbySpot && !isNavigating ? (
        <SpotDetailsCard
          distanceMeters={distanceMeters(userLngLat[0], userLngLat[1], clickedNearbySpot.lng, clickedNearbySpot.lat)}
          declaredAt={clickedNearbySpot.declared_at}
          onGetDirections={handleGetDirectionsFromPin}
          onClose={() => setSelectedSpotId(null)}
        />
      ) : isRouting ? (
        <div className="absolute top-1/2 left-4 -translate-y-1/2 z-20 flex flex-col gap-3" data-tour="actions">
          {/* `group` + `group-hover`/`group-focus-within` tooltip: the FAB
              alone doesn't say what it does, and this app is mostly used
              one-handed on a phone mount where a hover state won't fire --
              focus-within covers a tap/keyboard focus too, hover covers desktop. */}
          <div className="group relative">
            <button
              onClick={handleToggleSelectionMode}
              disabled={busyAction !== null}
              aria-label={t('map.sawFreeSpace')}
              className="w-12 h-12 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border border-primary/30 flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <Eye className="h-5 w-5 text-primary" />
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {t('map.sawFreeSpace')}
            </span>
          </div>
          <div className="group relative">
            <button
              onClick={handleDeclare}
              disabled={busyAction !== null}
              aria-label={activeSession ? t('map.leavingSpot') : t('map.emptyingSpace')}
              className="w-12 h-12 rounded-full shadow-xl bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busyAction === 'declare' ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
              ) : activeSession ? (
                <Check className="h-5 w-5 text-primary-foreground" />
              ) : (
                <Navigation className="h-5 w-5 text-primary-foreground" />
              )}
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {activeSession ? t('map.leavingSpot') : t('map.emptyingSpace')}
            </span>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4" data-tour="actions">
          <Button
            onClick={handleToggleSelectionMode}
            disabled={busyAction !== null}
            variant="outline"
            className="h-12 rounded-full px-4 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30 gap-2"
          >
            <Eye className="h-4 w-4" />
            <span className="text-sm">{t('map.sawFreeSpace')}</span>
            <span className="text-xs text-muted-foreground">+5</span>
          </Button>

          <Button
            onClick={handleDeclare}
            disabled={busyAction !== null}
            className="h-14 rounded-full px-6 shadow-xl gap-2 font-semibold bg-primary hover:bg-primary/90"
          >
            {busyAction === 'declare' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : activeSession ? (
              <Check className="h-5 w-5" />
            ) : (
              <Navigation className="h-5 w-5" />
            )}
            {activeSession ? t('map.leavingSpot') : t('map.emptyingSpace')}
          </Button>
        </div>
      )}

      {/* Searching Modal */}
      {routeState === 'searching' && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-card p-8 mx-4 text-center animate-fade-in">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">{t('map.smartSearch')}</h3>
            <p className="text-sm text-muted-foreground">{t('map.checkingSpots')}</p>
          </div>
        </div>
      )}

      {/* Limit Reached Modal */}
      {showLimitModal && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 mx-4 text-center animate-fade-in max-w-sm relative">
            <button onClick={() => setShowLimitModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-warning" />
            <h3 className="text-lg font-semibold mb-2">{t('map.limitTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('map.limitDesc')}</p>
            <Button
              onClick={() => {
                setShowLimitModal(false);
                onNavigateToPlans?.();
              }}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {t('map.upgradeCta')}
            </Button>
          </div>
        </div>
      )}

      {/* Demo-only celebration on successful declarations */}
      {celebrating && <ConfettiBurst onDone={() => setCelebrating(false)} />}

      {/* Bottom bar: destination name, remaining distance + ETA (Exit Navigation
          clears the whole route), plus the nearest already-reported free spot
          near it, if any. */}
      {activeDestination && routeState !== 'searching' && (
        <div className="absolute bottom-44 left-4 right-4 z-20">
          <div className="glass-card p-4 animate-fade-in space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{activeDestination.name}</p>
                {remaining && (
                  <p className="text-xs text-muted-foreground">
                    {t('map.navDistanceEta', {
                      km: (remaining.distanceMeters / 1000).toFixed(1),
                      min: Math.round(remaining.durationSeconds / 60),
                    })}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={clearRoute} aria-label={t('map.exitNavigation')} className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {poiMarker && (
              <div className="pt-2 border-t border-border flex items-center gap-2 text-xs text-success font-medium">
                <ParkingCircle className="h-3.5 w-3.5" />
                {t('map.walkMinutes', { n: walkMinutes })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Turn-by-turn instruction panel -- the current/next maneuver, right
          below the destination info card, filling the bottom-center space
          the big action buttons vacated (FABs moved to the side while
          isRouting). Suppressed while the "Is the spot free?" prompt is up,
          or while Map Selection Mode's Cancel/Confirm pair is using that
          same bottom-28 slot -- both would otherwise render on top of it. */}
      {isNavigating && currentStep && !showSpotPrompt && !selectionMode && (
        <div className="absolute bottom-28 left-4 right-4 z-20">
          <div className="glass-card p-4 shadow-2xl bg-primary text-primary-foreground rounded-2xl flex items-center gap-3 animate-fade-in">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ManeuverIcon type={currentStep.maneuverType} modifier={currentStep.maneuverModifier} className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm leading-tight">
                {t('map.inDistance', { distance: formatDistance(currentStep.distanceMeters) })}
              </p>
              <p className="text-xs text-primary-foreground/85 truncate">{currentStep.instruction}</p>
            </div>
          </div>
        </div>
      )}

      {/* "Is the spot free?" -- fires once the live position is within
          SPOT_PROXIMITY_METERS of the target spot. Reclaims the bottom-center
          area the big action buttons vacated (they're FABs on the side while
          isRouting), so this is front and center exactly when it matters. */}
      {showSpotPrompt && targetSpotId && (
        <div className="absolute bottom-28 left-4 right-4 z-30 flex justify-center">
          <div className="glass-card p-4 shadow-2xl animate-fade-in w-full max-w-sm space-y-3">
            <p className="font-semibold text-sm text-center">{t('map.isSpotFreeTitle')}</p>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleFindNextSpot}
                disabled={busyAction !== null}
                variant="outline"
                className="flex-1 gap-1.5"
              >
                <X className="h-4 w-4" />
                {t('map.noFindNext')}
              </Button>
              <Button
                onClick={handleSpotConfirmedFree}
                disabled={busyAction !== null}
                className="flex-1 gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
              >
                {busyAction === 'claim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t('map.yesIParked')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
