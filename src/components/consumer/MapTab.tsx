import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useNearbySpots } from '@/hooks/useNearbySpots';
import { declareSpot, claimSpot, manualUnpark } from '@/lib/api/parking';
import { Search, MapPin, Navigation, Eye, Loader2, X, AlertTriangle, Check, ParkingCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import chalkidaMap from '@/assets/chalkida-map.png';
import { MapboxMap, isMapboxConfigured, geocodeAddress } from './MapboxMap';
import { ConfettiBurst } from './ConfettiBurst';

// The mocked GPS accuracy for demo declarations: comfortably inside any
// server-side accuracy gate so reviewers succeed from a desk anywhere.
const DEMO_ACCURACY_METERS = 5;

type RouteState = 'idle' | 'searching' | 'found' | 'not_found';

interface Destination {
  name: string;
  lng: number;
  lat: number;
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

interface MapTabProps {
  onNavigateToPlans?: () => void;
}

export const MapTab = ({ onNavigateToPlans }: MapTabProps) => {
  const { incrementSearches } = useApp();
  const { profile, isDemoAccount } = useAuth();
  const { t } = useLanguage();
  const { getCurrentPosition } = useGeolocation();
  const { activeSession, refetch: refetchSession } = useActiveSession();
  const nearbySpots = useNearbySpots();

  const [searchQuery, setSearchQuery] = useState('');
  const [routeState, setRouteState] = useState<RouteState>('idle');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [activeDestination, setActiveDestination] = useState<Destination | null>(null);
  const [foundSpot, setFoundSpot] = useState<{ lng: number; lat: number } | null>(null);
  const [walkMinutes, setWalkMinutes] = useState<number>(2);
  const [busyAction, setBusyAction] = useState<'declare' | 'spotted' | 'claim' | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Real device position; falls back to the demo city center if unavailable.
  const [userLngLat, setUserLngLat] = useState<[number, number]>(MAP_CENTER);
  const [userAccuracy, setUserAccuracy] = useState<number>(9999);

  useEffect(() => {
    if (isDemoAccount) {
      // Demo reviewers judge from a desk, not a car: skip real geolocation
      // entirely and pretend the device is at the map center with perfect
      // accuracy. Real accounts below are completely unaffected.
      setUserAccuracy(DEMO_ACCURACY_METERS);
      return;
    }
    getCurrentPosition()
      .then(({ lat, lng, accuracy }) => {
        setUserLngLat([lng, lat]);
        setUserAccuracy(accuracy);
      })
      .catch(() => {
        // No permission / no GPS: stay on the fallback center. Declarations
        // will simply fail the accuracy/radius check server-side, as intended.
      });
  }, [getCurrentPosition, isDemoAccount]);

  // Demo only: the "user" follows the map, so wherever the reviewer pans,
  // that's where their declarations land.
  const handleCenterChange = useCallback(
    (lng: number, lat: number) => {
      if (isDemoAccount) setUserLngLat([lng, lat]);
    },
    [isDemoAccount]
  );

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({ title: t('map.enterDestination'), description: t('map.enterDestinationDesc'), variant: 'destructive' });
      return;
    }

    const canSearch = incrementSearches();
    if (!canSearch) {
      setShowLimitModal(true);
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

    setActiveDestination(destination);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Real nearby spots only -- no more fabricated "94% probability" spot.
    const candidates = nearbySpots.filter((s) => s.declared_by !== profile?.id);
    const closest = candidates.reduce<{ lng: number; lat: number; d: number } | null>((best, s) => {
      const d = distanceMeters(destination!.lng, destination!.lat, s.lng, s.lat);
      if (!best || d < best.d) return { lng: s.lng, lat: s.lat, d };
      return best;
    }, null);

    if (!closest) {
      setFoundSpot(null);
      setRouteState('not_found');
      toast({ title: t('map.noSpotsNear'), description: t('map.noSpotsNearDesc') });
      return;
    }

    setFoundSpot({ lng: closest.lng, lat: closest.lat });
    setRouteState('found');
    const minutes = walkingMinutes(closest.d);
    setWalkMinutes(minutes);
    toast({ title: t('map.spotFoundToast'), description: t('map.walkFromDest', { n: minutes }) });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearRoute = () => {
    setRouteState('idle');
    setActiveDestination(null);
    setFoundSpot(null);
    setSearchQuery('');
  };

  // "I'm leaving" -- declares the current spot free and, if the user had an
  // active claimed session, closes it with the honest-checkout bonus too.
  const handleDeclare = async () => {
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

  const handleSpotted = async () => {
    setBusyAction('spotted');
    const [lng, lat] = userLngLat;
    const { data, error } = await declareSpot({
      spotLat: lat,
      spotLng: lng,
      userLat: lat,
      userLng: lng,
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
    setBusyAction(null);
  };

  // Tapping the map reports a spot at that exact point -- if it's far from
  // the device's real GPS, the radius check rejects it. That's the anti-
  // cheat working as intended, not a bug.
  const handleMapTapDrop = async (lng: number, lat: number) => {
    setBusyAction('spotted');
    const [userLng, userLat] = userLngLat;
    const { data, error } = await declareSpot({
      spotLat: lat,
      spotLng: lng,
      userLat,
      userLng,
      accuracy: userAccuracy,
      kind: 'spotted',
    });
    if (error) {
      toast({ title: t('map.reportFailed'), description: error, variant: 'destructive' });
    } else if (data) {
      if (isDemoAccount) setCelebrating(true);
      toast({ title: t('map.pinDropped', { n: data.pointsAwarded }), description: t('map.pinDroppedDesc') });
    }
    setBusyAction(null);
  };

  const handleStaticMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const [lng, lat] = percentToLngLat(xPct, yPct);
    handleMapTapDrop(lng, lat);
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      {isMapboxConfigured ? (
        <MapboxMap
          center={MAP_CENTER}
          userLocation={userLngLat}
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
          ]}
          onMapClick={handleMapTapDrop}
          onCenterChange={handleCenterChange}
          routeTo={routeState === 'found' && foundSpot ? [foundSpot.lng, foundSpot.lat] : null}
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
        </div>
      )}

      {/* Header - Search Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyPress}
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
        </div>
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

      {/* Central Check-out + Secondary "I saw a free space" buttons */}
      <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4" data-tour="actions">
        <Button
          onClick={handleSpotted}
          disabled={busyAction !== null}
          variant="outline"
          className="h-12 rounded-full px-4 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30 gap-2"
        >
          {busyAction === 'spotted' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
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

      {/* Route Info Card */}
      {routeState === 'found' && foundSpot && (
        <div className="absolute bottom-44 left-4 right-4 z-20">
          <div className="glass-card p-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{t('map.spotFoundCard')}</p>
                <p className="text-xs text-muted-foreground">{t('map.walkMinutes', { n: walkMinutes })}</p>
              </div>
              <Button size="sm" variant="outline" onClick={clearRoute}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
