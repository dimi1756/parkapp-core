import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Reads the token from an env variable so it's never hardcoded in source.
// Add VITE_MAPBOX_TOKEN=pk.xxxxx to a .env file at the project root.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export const isMapboxConfigured = Boolean(MAPBOX_TOKEN);

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
  routeTo?: [number, number] | null;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({ center, userLocation, pins, onMapClick, routeTo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

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
        el.className = 'mapbox-pin';
        el.style.backgroundColor = color;
        if (pin.label) {
          const popup = new mapboxgl.Popup({ offset: 12 }).setText(pin.label);
          markersRef.current[pin.id] = new mapboxgl.Marker({ element: el })
            .setLngLat([pin.lng, pin.lat])
            .setPopup(popup)
            .addTo(map);
        } else {
          markersRef.current[pin.id] = new mapboxgl.Marker({ element: el })
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
