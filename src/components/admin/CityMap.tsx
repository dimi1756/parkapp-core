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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    <div className={`glass-card p-4 md:p-6 ${tall ? 'h-[70vh]' : 'h-[500px]'} animate-fade-in`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
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

      {loading ? (
        <Skeleton className="h-[calc(100%-60px)] rounded-2xl" />
      ) : isMapboxConfigured ? (
        <div ref={containerRef} className="relative w-full h-[calc(100%-60px)] rounded-2xl overflow-hidden border border-border" />
      ) : (
        <div className="h-[calc(100%-60px)] rounded-2xl border border-border flex items-center justify-center text-sm text-muted-foreground">
          {t('admin.noMapToken')}
        </div>
      )}
    </div>
  );
};
