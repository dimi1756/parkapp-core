import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { zonesToGeoJson, type ParkingZone, type ZoneKind } from '@/lib/zones';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface ZoneDrawMapProps {
  /** Where the map opens -- the municipality's own centre. */
  center: [number, number];
  /** Zones already saved, drawn for context so a new one can be placed relative to them. */
  existingZones: ParkingZone[];
  /** The line being drawn right now, as [lng, lat] points in click order. */
  draftPoints: [number, number][];
  /** Colours the draft while it's being drawn. */
  draftKind: ZoneKind;
  /** Fires with the clicked coordinate so the parent can append a point. */
  onAddPoint: (lng: number, lat: number) => void;
}

const KIND_COLOR: Record<ZoneKind, string> = {
  resident: '#dc2626',
  controlled: '#f59e0b',
};

/**
 * Click-to-draw map for the zone editor.
 *
 * Each click appends a vertex to the line being drawn, which is exactly how
 * a street axis gets traced: follow the road, click at each bend. Chosen
 * over mapbox-gl-draw on purpose -- that library brings a whole editing
 * toolbar and another dependency for a job that is, literally, "collect the
 * points I click on".
 *
 * Deliberately separate from the consumer MapboxMap: that component carries
 * GPS tracking, follow mode, markers, routing and camera policy, none of
 * which belongs on an admin drawing surface.
 */
export const ZoneDrawMap: React.FC<ZoneDrawMapProps> = ({
  center,
  existingZones,
  draftPoints,
  draftKind,
  onAddPoint,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const vertexMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const onAddPointRef = useRef(onAddPoint);
  onAddPointRef.current = onAddPoint;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      // Tight enough that a click lands on the intended street rather than
      // the one next to it -- the whole point of drawing these by hand.
      zoom: 16,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('click', (e) => onAddPointRef.current(e.lngLat.lng, e.lngLat.lat));
    map.getCanvas().style.cursor = 'crosshair';

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved zones, for context.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const data = zonesToGeoJson(existingZones);
      const source = map.getSource('saved-zones') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource('saved-zones', { type: 'geojson', data });
      map.addLayer({
        id: 'saved-zones-line',
        type: 'line',
        source: 'saved-zones',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'kind'], 'resident', KIND_COLOR.resident, KIND_COLOR.controlled] as unknown as string,
          'line-width': 10,
          'line-opacity': 0.4,
        },
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [existingZones]);

  // The line being drawn, plus a numbered dot on every vertex so it's clear
  // what was clicked and in what order.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: draftPoints },
      };
      const source = map.getSource('draft-zone') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else {
        map.addSource('draft-zone', { type: 'geojson', data });
        map.addLayer({
          id: 'draft-zone-line',
          type: 'line',
          source: 'draft-zone',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': KIND_COLOR[draftKind], 'line-width': 6 },
        });
      }
      if (map.getLayer('draft-zone-line')) {
        map.setPaintProperty('draft-zone-line', 'line-color', KIND_COLOR[draftKind]);
      }

      // Markers are recreated wholesale rather than diffed: a draft is a
      // handful of points, and reconciling them would be more code than it
      // saves.
      vertexMarkersRef.current.forEach((marker) => marker.remove());
      vertexMarkersRef.current = draftPoints.map((point, i) => {
        const el = document.createElement('div');
        el.style.cssText = `display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:${KIND_COLOR[draftKind]};border:2px solid white;color:white;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
        el.textContent = String(i + 1);
        return new mapboxgl.Marker({ element: el }).setLngLat(point).addTo(map);
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [draftPoints, draftKind]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full w-full rounded-2xl bg-secondary/50 flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          VITE_MAPBOX_TOKEN is not configured, so zones can't be drawn on a map.
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden" />;
};
