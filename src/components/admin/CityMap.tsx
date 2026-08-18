import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Skeleton } from '@/components/ui/skeleton';
import { isMapboxConfigured } from '@/components/consumer/MapboxMap';
import { useLanguage } from '@/contexts/LanguageContext';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export interface LiveSpot {
  id: string;
  lat: number;
  lng: number;
  status: 'active' | 'claimed' | 'expired' | 'invalid' | 'reported';
  declared_at: string;
  expires_at: string;
}

const STATUS_COLOR: Record<LiveSpot['status'], string> = {
  active: '#28A745',
  claimed: '#0056b3',
  reported: '#dc3545',
  expired: '#9ca3af',
  invalid: '#9ca3af',
};

interface CityMapProps {
  spots: LiveSpot[];
  loading: boolean;
  municipalityName: string | null;
  tall?: boolean;
}

export const CityMap: React.FC<CityMapProps> = ({ spots, loading, municipalityName, tall }) => {
  const { t, locale } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!isMapboxConfigured || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN!;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [23.591, 38.4636],
      zoom: 13,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    // Mapbox measures the container once at construction time via
    // getBoundingClientRect(). The header above it stacks from one row to
    // two (title + wrapping legend) on narrow screens, so on first mount
    // the flex layout can still be settling when that measurement happens
    // -- Mapbox then bakes in a stale/undersized canvas and never
    // repaints on its own. A double rAF resize catches that first-paint
    // race (one frame for layout, one for the browser to commit it).
    let settleFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => map.resize());
    });
    map.once('load', () => map.resize());

    // ResizeObserver keeps the map's internal canvas in sync with the
    // container for every *later* size change too -- header re-wrapping on
    // window resize/orientation change, the legend growing to a second
    // line, a sidebar toggling, etc. rAF-throttled so a burst of entries
    // (e.g. during a CSS transition) collapses into a single resize call
    // and never trips "ResizeObserver loop limit exceeded".
    let observerFrame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (observerFrame !== null) cancelAnimationFrame(observerFrame);
      observerFrame = requestAnimationFrame(() => map.resize());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(settleFrame);
      if (observerFrame !== null) cancelAnimationFrame(observerFrame);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Density heatmap underneath the individual markers -- admin_live_spots
  // (0005_admin_authorization.sql) already returns every status over the
  // last 24h, not just currently-active spots (that filtering only applies
  // to the driver-facing map, see useNearbySpots.ts), so this reads as a
  // genuine "where is parking activity happening across the city" view
  // rather than just "what's free right now". Markers stay on top for
  // per-spot inspection (status/time popup); the heatmap adds the
  // at-a-glance density picture neither the markers nor the KPI numbers do.
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Untyped literal (rather than an explicit GeoJSON.* annotation) --
    // the global GeoJSON namespace isn't resolvable in this project's tsconfig
    // (a pre-existing gap, see MapboxMap.tsx's own route-drawing GeoJSON use),
    // and mapboxgl's own addSource/setData signatures accept this shape fine.
    const data = {
      type: 'FeatureCollection' as const,
      features: spots.map((s) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      })),
    };

    const applyHeatmap = () => {
      const source = map.getSource('city-activity') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource('city-activity', { type: 'geojson', data });
      map.addLayer({
        id: 'city-activity-heat',
        type: 'heatmap',
        source: 'city-activity',
        maxzoom: 17,
        paint: {
          'heatmap-weight': 0.6,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 1.8],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(40,167,69,0.35)',
            0.5, 'rgba(245,158,11,0.55)',
            1, 'rgba(220,53,69,0.75)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 16, 16, 34],
          'heatmap-opacity': 0.75,
        },
      });
    };

    if (map.isStyleLoaded()) applyHeatmap();
    else map.once('load', applyHeatmap);

    // The map's initial center/zoom is a static default (13, roughly
    // central Greece) -- it doesn't know where this municipality's spots
    // actually are until they load, so fit the camera to whatever real data
    // just arrived instead of leaving the admin to pan and find it themselves.
    if (spots.length > 0) {
      const bounds = spots.reduce(
        (b, s) => b.extend([s.lng, s.lat]),
        new mapboxgl.LngLatBounds([spots[0].lng, spots[0].lat], [spots[0].lng, spots[0].lat])
      );
      const fit = () => map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
      if (map.isStyleLoaded()) fit();
      else map.once('load', fit);
    }
  }, [spots]);

  // Sync markers whenever the spot list changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    spots.forEach((spot) => {
      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '9999px';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
      el.style.background = STATUS_COLOR[spot.status];

      const popup = new mapboxgl.Popup({ offset: 12 }).setText(
        `${spot.status} • ${new Date(spot.declared_at).toLocaleTimeString(locale)}`
      );

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([spot.lng, spot.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
    });
  }, [spots, locale]);

  const activeCount = spots.filter((s) => s.status === 'active').length;

  return (
    // flex-col + shrink-0 header + flex-1 min-h-0 map area replaces the old
    // h-[calc(100%-60px)] "magic number", which assumed the header was
    // always exactly 60px tall. It isn't: the header below stacks from one
    // row to two (title + wrapping legend) on narrow screens, so a fixed
    // subtraction either clips the map or leaves it too tall. Real flexbox
    // space distribution makes the map area's height correct no matter how
    // many lines the header wraps to.
    <div className={`glass-card p-4 md:p-6 flex flex-col ${tall ? 'h-[70vh]' : 'h-[500px]'} animate-fade-in`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 shrink-0">
        <div className="min-w-0">
          <h3 className="text-lg font-bold truncate">{t('admin.liveMapTitle', { name: municipalityName ?? t('admin.city') })}</h3>
          <p className="text-sm text-muted-foreground">{t('admin.activeSpots24h', { n: activeCount })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span>{t('admin.legendActive')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span>{t('admin.legendClaimed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span>{t('admin.legendReported')}</span>
          </div>
        </div>
      </div>

      {isMapboxConfigured ? (
        // The Mapbox container stays mounted at all times -- it used to be
        // swapped out for a <Skeleton> while `loading` was true, which meant
        // containerRef.current was still null when the map-init effect ran
        // on mount (loading starts true), so the map never initialized at
        // all until something happened to remount this subtree. The
        // skeleton is now a simple overlay on top instead, so the ref (and
        // therefore Mapbox's construction) is reliable regardless of when
        // the underlying data finishes loading.
        <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-border">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && <Skeleton className="absolute inset-0 rounded-2xl" />}
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-2xl border border-border flex items-center justify-center text-sm text-muted-foreground">
          {t('admin.noMapToken')}
        </div>
      )}
    </div>
  );
};
