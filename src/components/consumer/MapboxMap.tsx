import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1&proximity=${proximity[0]},${proximity[1]}`;

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

export interface MapPin {
  id: string;
  lng: number;
  lat: number;
  type: 'mine' | 'reported' | 'destination';
  label?: string;
}

interface MapboxMapProps {
  center: [number, number]; // [lng, lat]
  userLocation: [number, number];
  pins: MapPin[];
  onMapClick?: (lng: number, lat: number) => void;
  /** Fires after every pan/zoom settles with the new map center. */
  onCenterChange?: (lng: number, lat: number) => void;
  routeTo?: [number, number] | null;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({ center, userLocation, pins, onMapClick, onCenterChange, routeTo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // Ref keeps the moveend listener stable while callers pass fresh closures.
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  // Initialize map once
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 15,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({ trackUserLocation: true }), 'top-right');

    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick(e.lngLat.lng, e.lngLat.lat);
      });
    }

    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChangeRef.current?.(c.lng, c.lat);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep user location marker in sync
  useEffect(() => {
    if (!mapRef.current) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'mapbox-user-dot';
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userLocation).addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat(userLocation);
    }
  }, [userLocation]);

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
      const color = pin.type === 'mine' ? '#16a34a' : pin.type === 'reported' ? '#2563eb' : '#dc2626';

      if (!markersRef.current[pin.id]) {
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
      } else {
        markersRef.current[pin.id].setLngLat([pin.lng, pin.lat]);
      }
    });
  }, [pins]);

  // Route line to destination
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const drawRoute = () => {
      if (map.getSource('route')) {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeTo ? [userLocation, routeTo] : [],
          },
        });
        return;
      }

      if (!routeTo) return;

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [userLocation, routeTo] },
        },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#0059B3', 'line-width': 4 },
      });
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once('load', drawRoute);
    }
  }, [routeTo, userLocation]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
};
