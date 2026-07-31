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
  getDrivingDirections,
  type PlaceSuggestion,
  type RouteStep,
} from './MapboxMap';
import { ConfettiBurst } from './ConfettiBurst';

// The mocked GPS accuracy for demo declarations: comfortably inside any
// server-side accuracy gate so reviewers succeed from a desk anywhere.
const DEMO_ACCURACY_METERS = 5;

// Once the live GPS position gets this close to a maneuver point, the
// turn-by-turn banner advances to the next step.
const STEP_ADVANCE_RADIUS_METERS = 30;

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
  public: { name: 'Public Chalkida', x: 52, y: 48 },
};

// Fallback center (Chalkida, Greece) used whenever real geolocation isn't
// available (denied permission, desktop demo browser, etc).
const MAP_CENTER: [number, number] = [23.5910, 38.4636];

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
}

export const MapTab = ({ onNavigateToPlans }: MapTabProps) => {
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
  const [foundSpot, setFoundSpot] = useState<{ lng: number; lat: number } | null>(null);
  const [walkMinutes, setWalkMinutes] = useState<number>(2);
  const [busyAction, setBusyAction] = useState<'declare' | 'spotted' | 'claim' | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [locateRequestId, setLocateRequestId] = useState(0);

  // "I saw a free space" (white button) enters this mode: the next map tap
  // drops a temporary yellow pin instead of declaring immediately, so the
  // reporter can mark a spot they saw elsewhere rather than under their feet.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<{ lng: number; lat: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);
  // Set right before we programmatically fill the search box with a chosen
  // suggestion's full name, so that text change doesn't re-trigger the
  // autocomplete effect and pop the dropdown back open over the selection.
  const suppressNextAutocompleteRef = useRef(false);

  // Real device position; falls back to the demo city center if unavailable.
  const [userLngLat, setUserLngLat] = useState<[number, number]>(MAP_CENTER);
  const [userAccuracy, setUserAccuracy] = useState<number>(9999);

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
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timer = setTimeout(async () => {
      const results = await searchPlaces(searchQuery, MAP_CENTER);
      if (searchRequestIdRef.current === requestId) setSuggestions(results);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const runDestinationSearch = async (destination: Destination) => {
    const canSearch = incrementSearches();
    if (!canSearch) {
      setShowLimitModal(true);
      return;
    }

    setRouteState('searching');
    setActiveDestination(destination);
    setRouteTotals(null);
    setRouteCoords(null);
    setRouteSteps(null);
    setCurrentStepIndex(0);

    const directions = await getDrivingDirections(
      userLngLat,
      [destination.lng, destination.lat],
      language === 'gr' ? 'el' : 'en'
    );
    if (directions) {
      setRouteCoords(directions.coordinates);
      setRouteSteps(directions.steps.length > 0 ? directions.steps : null);
      setRouteTotals({ distanceMeters: directions.distanceMeters, durationSeconds: directions.durationSeconds });
    } else {
      toast({ title: t('map.routeUnavailable'), variant: 'destructive' });
    }

    // Nearest already-reported free spot near the destination -- the actual
    // parking value-add, kept alongside the new turn-by-turn navigation.
    const candidates = nearbySpots.filter((s) => s.declared_by !== profile?.id);
    const closest = candidates.reduce<{ lng: number; lat: number; d: number } | null>((best, s) => {
      const d = distanceMeters(destination.lng, destination.lat, s.lng, s.lat);
      if (!best || d < best.d) return { lng: s.lng, lat: s.lat, d };
      return best;
    }, null);

    if (!closest) {
      setFoundSpot(null);
      setRouteState('not_found');
    } else {
      setFoundSpot({ lng: closest.lng, lat: closest.lat });
      setRouteState('found');
      setWalkMinutes(walkingMinutes(closest.d));
      toast({ title: t('map.spotFoundToast'), description: t('map.walkFromDest', { n: walkingMinutes(closest.d) }) });
    }
  };

  const handleSelectSuggestion = async (place: PlaceSuggestion) => {
    setSuggestions([]);
    suppressNextAutocompleteRef.current = true;
    setSearchQuery(place.name);
    inputRef.current?.blur();
    await runDestinationSearch({ name: place.name, lng: place.lng, lat: place.lat });
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
      const result = await geocodeAddress(searchQuery, MAP_CENTER);
      if (!result) {
        setRouteState('idle');
        toast({ title: t('map.locationNotFound'), description: t('map.locationNotFoundDesc'), variant: 'destructive' });
        return;
      }
      destination = result;
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
    setFoundSpot(null);
    setRouteTotals(null);
    setRouteCoords(null);
    setRouteSteps(null);
    setCurrentStepIndex(0);
    setSearchQuery('');
    setSuggestions([]);
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
    const [lng, lat] = userLngLat;
    const { data, error } = await declareSpot({
      spotLat: lat,
      spotLng: lng,
      userLat: lat,
      userLng: lng,
      accuracy: userAccuracy,
      kind: 'vacating',
    });

    if (error) {
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
    toast({ title: t('map.selectionModeTitle'), description: t('map.selectionModeDesc') });
  };

  const handleMapTap = (lng: number, lat: number) => {
    if (!selectionMode) return;
    setSelectedSpot({ lng, lat });
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
      toast({ title: t('map.reportFailed'), description: error, variant: 'destructive' });
    } else if (data) {
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
          showCustomUserDot={isDemoAccount}
          onUserLocationChange={handleUserLocationChange}
          locateRequestId={locateRequestId}
          pins={[
            ...nearbySpots.map((s) => ({
              id: s.id,
              lng: s.lng,
              lat: s.lat,
              type: (s.declared_by === profile?.id ? 'mine' : 'reported') as 'mine' | 'reported',
              label: s.declared_by === profile?.id ? 'Your declared spot' : 'Reported free space',
            })),
            ...(activeDestination
              ? [{ id: 'destination', lng: activeDestination.lng, lat: activeDestination.lat, type: 'destination' as const, label: activeDestination.name }]
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
          <img src={chalkidaMap} alt="Chalkida Map" className="w-full h-full object-cover" />
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

          {foundSpot && routeState === 'found' && (() => {
            const pct = lngLatToPercent(foundSpot.lng, foundSpot.lat);
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
                    <span className="text-sm truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Points Pill */}
      <div className="absolute top-24 left-4 z-20" data-tour="points">
        <div className="points-pill flex items-center gap-2">
          <span>💎</span>
          <span>{profile?.points_balance ?? 0} {t('map.points')}</span>
        </div>
      </div>

      {/* Claimable spot banner */}
      {!activeSession && nearestClaimable && (
        <div className="absolute top-24 right-4 z-20">
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

      {/* Central Check-out + Secondary "I saw a free space" buttons */}
      <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4" data-tour="actions">
        <Button
          onClick={handleToggleSelectionMode}
          disabled={busyAction !== null}
          variant="outline"
          className="h-12 rounded-full px-4 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30 gap-2"
        >
          {selectionMode ? <X className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="text-sm">{selectionMode ? t('profile.cancel') : t('map.sawFreeSpace')}</span>
          {!selectionMode && <span className="text-xs text-muted-foreground">+5</span>}
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
            {foundSpot && (
              <div className="pt-2 border-t border-border flex items-center gap-2 text-xs text-success font-medium">
                <ParkingCircle className="h-3.5 w-3.5" />
                {t('map.walkMinutes', { n: walkMinutes })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
