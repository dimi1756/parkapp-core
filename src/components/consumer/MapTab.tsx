import React, { useState, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Search, MapPin, Navigation, Eye, Loader2, X, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import chalkidaMap from '@/assets/chalkida-map.png';
import { MapboxMap, isMapboxConfigured, geocodeAddress } from './MapboxMap';

// Route state type
type RouteState = 'idle' | 'searching' | 'found';

// A pin represents an empty-space signal on the map.
// 'mine'     -> created by this user's own check-out (central button)
// 'reported' -> a passive "I saw a free space" sighting, or a manual map tap
interface PinRecord {
  id: string;
  x: number; // percent position, used for the static fallback map
  y: number;
  type: 'mine' | 'reported';
  label: string;
}

interface Destination {
  name: string;
  lng: number;
  lat: number;
}

// Mock destinations used only when Mapbox isn't configured (no real geocoding available)
const MOCK_DESTINATIONS = {
  'mikel': { name: 'Mikel Coffee', x: 55, y: 35 },
  'sklavenitis': { name: 'Sklavenitis', x: 70, y: 50 },
  'public': { name: 'Public Chalkida', x: 52, y: 48 },
};

// Demo center point (Chalkida, Greece) used to project percent coords to real
// lng/lat for the Mapbox view, and vice versa. Swap for the real deployment city later.
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

export const MapTab = () => {
  const { points, addPoints, incrementSearches } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [routeState, setRouteState] = useState<RouteState>('idle');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [activeDestination, setActiveDestination] = useState<Destination | null>(null);
  const [parkingSpot, setParkingSpot] = useState<{ lng: number; lat: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Crowdsourced empty-space pins
  const [pins, setPins] = useState<PinRecord[]>([]);
  const [isSpaceMarkedEmpty, setIsSpaceMarkedEmpty] = useState(false);
  const myPinIdRef = useRef<string | null>(null);

  // User location (center of the map / percent position on the fallback image)
  const userLocation = { x: 45, y: 55 };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Enter a destination",
        description: "Type an address or location",
        variant: "destructive",
      });
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
      // Real geocoding — only succeeds for places that actually exist
      const result = await geocodeAddress(searchQuery, MAP_CENTER);
      if (!result) {
        setRouteState('idle');
        toast({
          title: "Location not found",
          description: "Try a different address or place name",
          variant: "destructive",
        });
        return;
      }
      destination = result;
    } else {
      // No Mapbox token configured: fall back to the old mock/demo matching
      const queryLower = searchQuery.toLowerCase();
      const mock = Object.entries(MOCK_DESTINATIONS).find(([key]) =>
        queryLower.includes(key) || key.includes(queryLower)
      )?.[1] ?? { name: searchQuery, x: 60, y: 40 };
      const [lng, lat] = percentToLngLat(mock.x, mock.y);
      destination = { name: mock.name, lng, lat };
    }

    setActiveDestination(destination);

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate a nearby free spot a short walk from the destination
    const spot = {
      lng: destination.lng + (Math.random() - 0.5) * 0.0008,
      lat: destination.lat - 0.0003 - Math.random() * 0.0003,
    };
    setParkingSpot(spot);
    setRouteState('found');

    toast({
      title: "Spot found!",
      description: "2 min walk from your destination",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearRoute = () => {
    setRouteState('idle');
    setActiveDestination(null);
    setParkingSpot(null);
    setSearchQuery('');
  };

  // --- Central Check-out / Check-in button ---
  // First tap  ("Emptying a space") -> creates a pin, +10 points
  // Second tap ("Parked")           -> removes that pin
  const handleCentralToggle = () => {
    if (!isSpaceMarkedEmpty) {
      const id = crypto.randomUUID();
      const pin: PinRecord = { id, x: userLocation.x, y: userLocation.y, type: 'mine', label: 'Space just emptied' };
      setPins(prev => [...prev, pin]);
      myPinIdRef.current = id;
      setIsSpaceMarkedEmpty(true);
      addPoints(10);
      toast({
        title: "Spot marked as empty! +10 points",
        description: "Other drivers can now see this space on the map",
      });
    } else {
      setPins(prev => prev.filter(p => p.id !== myPinIdRef.current));
      myPinIdRef.current = null;
      setIsSpaceMarkedEmpty(false);
      toast({
        title: "Marked as parked",
        description: "Thanks — the spot was removed from the map",
      });
    }
  };

  // --- Secondary passive-crowdsourcing button ---
  // "I saw a free space" -> drops a pin near the user, +5 points, auto-expires
  const handleSpotted = () => {
    const id = crypto.randomUUID();
    const jitterX = (Math.random() - 0.5) * 10;
    const jitterY = (Math.random() - 0.5) * 10;
    const pin: PinRecord = {
      id,
      x: userLocation.x + jitterX,
      y: userLocation.y + jitterY,
      type: 'reported',
      label: 'Reported free space',
    };
    setPins(prev => [...prev, pin]);
    addPoints(5);
    toast({
      title: "Reported! +5 points",
      description: "You're helping the community",
    });
    setTimeout(() => setPins(prev => prev.filter(p => p.id !== id)), 25000);
  };

  // Let people drop a pin by tapping directly on the map
  const handleMapTapDrop = (x: number, y: number) => {
    const id = crypto.randomUUID();
    const pin: PinRecord = { id, x, y, type: 'reported', label: 'Reported free space' };
    setPins(prev => [...prev, pin]);
    addPoints(5);
    toast({ title: "Pin dropped! +5 points", description: "Marked as a free space" });
    setTimeout(() => setPins(prev => prev.filter(p => p.id !== id)), 25000);
  };

  const handleStaticMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    handleMapTapDrop(x, y);
  };

  // Destination/spot expressed as percent coords, for the static fallback map only
  const destinationPercent = activeDestination ? lngLatToPercent(activeDestination.lng, activeDestination.lat) : null;
  const parkingSpotPercent = parkingSpot ? lngLatToPercent(parkingSpot.lng, parkingSpot.lat) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Map: real interactive Mapbox map if a token is configured, otherwise the demo image */}
      {isMapboxConfigured ? (
        <MapboxMap
          center={MAP_CENTER}
          userLocation={MAP_CENTER}
          pins={[
            ...pins.map(p => {
              const [lng, lat] = percentToLngLat(p.x, p.y);
              return { id: p.id, lng, lat, type: p.type, label: p.label };
            }),
            ...(activeDestination
              ? [{ id: 'destination', lng: activeDestination.lng, lat: activeDestination.lat, type: 'destination' as const, label: activeDestination.name }]
              : []),
            ...(parkingSpot
              ? [{ id: 'parking-spot', lng: parkingSpot.lng, lat: parkingSpot.lat, type: 'mine' as const, label: 'Available spot' }]
              : []),
          ]}
          onMapClick={handleMapTapDrop}
          routeTo={routeState === 'found' && parkingSpot ? [parkingSpot.lng, parkingSpot.lat] : null}
        />
      ) : (
        <div ref={imageContainerRef} className="absolute inset-0" onClick={handleStaticMapClick}>
          <img
            src={chalkidaMap}
            alt="Chalkida Map"
            className="w-full h-full object-cover"
          />
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
            placeholder="Where are you going?"
            className="w-full h-14 pl-12 pr-16 text-base rounded-2xl shadow-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            onClick={handleSearch}
            disabled={routeState === 'searching'}
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
          >
            {routeState === 'searching' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Points Pill - Below Search */}
      <div className="absolute top-24 left-4 z-20">
        <div className="points-pill flex items-center gap-2">
          <span>💎</span>
          <span>{points} Points</span>
        </div>
      </div>

      {/* Overlay elements only needed for the static fallback map.
          In Mapbox mode, MapboxMap renders its own markers/route. */}
      {!isMapboxConfigured && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* User Location - Pulsing Blue Dot */}
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${userLocation.x}%`, top: `${userLocation.y}%` }}
          >
            <div className="relative">
              <div className="absolute inset-0 w-8 h-8 -m-2 rounded-full bg-primary/30 animate-ping" />
              <div className="absolute inset-0 w-6 h-6 -m-1 rounded-full bg-primary/50" />
              <div className="w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg" />
            </div>
          </div>

          {/* Crowdsourced empty-space pins */}
          {pins.map(pin => (
            <div
              key={pin.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-fade-in"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              <div className={`w-4 h-4 rounded-full border-2 border-white shadow-lg ${pin.type === 'mine' ? 'bg-success' : 'bg-primary'}`} />
            </div>
          ))}

          {/* Destination Pin */}
          {destinationPercent && routeState !== 'idle' && (
            <div
              className="absolute transform -translate-x-1/2 -translate-y-full"
              style={{ left: `${destinationPercent.x}%`, top: `${destinationPercent.y}%` }}
            >
              <div className="flex flex-col items-center">
                <div className="bg-destructive text-destructive-foreground px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1 whitespace-nowrap max-w-[160px] truncate">
                  {activeDestination?.name}
                </div>
                <MapPin className="h-8 w-8 text-destructive drop-shadow-lg" fill="currentColor" />
              </div>
            </div>
          )}

          {/* Parking Spot - Neon Green Highlight */}
          {parkingSpotPercent && routeState === 'found' && (
            <div
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${parkingSpotPercent.x}%`, top: `${parkingSpotPercent.y}%` }}
            >
              <div className="relative">
                <div className="absolute inset-0 w-12 h-12 -m-4 rounded-full bg-success/40 animate-pulse" />
                <div className="w-4 h-4 rounded-sm bg-success border-2 border-white shadow-lg rotate-45" />
              </div>
            </div>
          )}

          {/* Route Lines */}
          {parkingSpotPercent && destinationPercent && routeState === 'found' && (
            <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
              <line
                x1={`${userLocation.x}%`}
                y1={`${userLocation.y}%`}
                x2={`${parkingSpotPercent.x}%`}
                y2={`${parkingSpotPercent.y}%`}
                stroke="hsl(var(--primary))"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1={`${parkingSpotPercent.x}%`}
                y1={`${parkingSpotPercent.y}%`}
                x2={`${destinationPercent.x}%`}
                y2={`${destinationPercent.y}%`}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="3"
                strokeDasharray="8,6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      )}

      {/* Central Check-out/Check-in + Secondary "I saw a free space" buttons */}
      <div className="absolute bottom-28 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4">
        <Button
          onClick={handleSpotted}
          variant="outline"
          className="h-12 rounded-full px-4 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30 gap-2"
        >
          <Eye className="h-4 w-4" />
          <span className="text-sm">I saw a free space</span>
          <span className="text-xs text-muted-foreground">+5</span>
        </Button>

        <Button
          onClick={handleCentralToggle}
          className={`h-14 rounded-full px-6 shadow-xl gap-2 font-semibold ${
            isSpaceMarkedEmpty
              ? 'bg-success hover:bg-success/90 text-success-foreground'
              : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {isSpaceMarkedEmpty ? (
            <>
              <Check className="h-5 w-5" />
              Parked
            </>
          ) : (
            <>
              <Navigation className="h-5 w-5" />
              Emptying a space
            </>
          )}
        </Button>
      </div>

      {/* Searching Modal */}
      {routeState === 'searching' && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-card p-8 mx-4 text-center animate-fade-in">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Smart Search</h3>
            <p className="text-sm text-muted-foreground">Analyzing availability in real time...</p>
          </div>
        </div>
      )}

      {/* Limit Reached Modal */}
      {showLimitModal && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 mx-4 text-center animate-fade-in max-w-sm relative">
            <button
              onClick={() => setShowLimitModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-warning" />
            <h3 className="text-lg font-semibold mb-2">Daily Limit Reached</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You've used your free search for today.
            </p>
            <Button
              onClick={() => setShowLimitModal(false)}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Upgrade to Premium
            </Button>
          </div>
        </div>
      )}

      {/* Route Info Card - Shows when route is found */}
      {routeState === 'found' && parkingSpot && (
        <div className="absolute bottom-44 left-4 right-4 z-20">
          <div className="glass-card p-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Parking Spot Found</p>
                <p className="text-xs text-muted-foreground">2 min walk • High availability</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
                <span className="text-sm font-medium text-success">94%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
