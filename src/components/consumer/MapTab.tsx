import React, { useState, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Search, MapPin, Navigation, Eye, Loader2, X, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import chalkidaMap from '@/assets/chalkida-map.png';
import { MapboxMap, isMapboxConfigured } from './MapboxMap';

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

// Destination coordinates (relative percentages on the map)
const DESTINATIONS = {
  'mikel': { name: 'Mikel Coffee', x: 55, y: 35 },
  'sklavenitis': { name: 'Sklavenitis', x: 70, y: 50 },
  'public': { name: 'Public Chalkida', x: 52, y: 48 },
};

// Demo center point (Chalkida, Greece) used to project percent coords to real
// lng/lat for the Mapbox view. Swap this for the real deployment city later.
const MAP_CENTER: [number, number] = [23.5910, 38.4636];

function percentToLngLat(x: number, y: number): [number, number] {
  const lng = MAP_CENTER[0] + ((x - 50) / 50) * 0.01;
  const lat = MAP_CENTER[1] - ((y - 50) / 50) * 0.008;
  return [lng, lat];
}

export const MapTab = () => {
  const { points, addPoints, incrementSearches } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [routeState, setRouteState] = useState<RouteState>('idle');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [activeDestination, setActiveDestination] = useState<{ name: string; x: number; y: number } | null>(null);
  const [parkingSpot, setParkingSpot] = useState<{ x: number; y: number } | null>(null);
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

    const queryLower = searchQuery.toLowerCase();
    let destination = Object.entries(DESTINATIONS).find(([key]) =>
      queryLower.includes(key) || key.includes(queryLower)
    )?.[1];

    if (!destination) {
      destination = { name: searchQuery, x: 60, y: 40 };
    }

    setActiveDestination(destination);
    setRouteState('searching');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const spot = {
      x: destination.x - 5 + Math.random() * 3,
      y: destination.y + 3 + Math.random() * 2,
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

  // --- TASK 3: Central Check-out / Check-in button ---
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

  // --- TASK 3: Secondary passive-crowdsourcing button ---
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
    // Sighting reports are unverified, so let them expire after a while
    setTimeout(() => setPins(prev => prev.filter(p => p.id !== id)), 25000);
  };

  // TASK 2: let people drop a pin by tapping directly on the map
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

  return (
