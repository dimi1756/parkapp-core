import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminOperatingArea } from '@/hooks/useOperatingArea';
import { operatingAreaToGeoJson, type OperatingArea } from '@/lib/operatingArea';
import { Loader2, MapPin, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface OperatingAreaConfigProps {
  municipalityId: string | null;
  /** Fallback map centre when the municipality has no coordinates at all. */
  fallbackCenter: [number, number];
}

/**
 * Where the pilot operates: a centre pin and a radius.
 *
 * This is what makes the app location-agnostic in practice rather than in
 * principle. The covered area used to be implied by coordinates written into
 * the frontend, so onboarding a second municipality meant a code change.
 * Now a city defines its own boundary, drivers see it on their map, and
 * actions outside it are refused with an explanation instead of failing
 * obscurely.
 */
export const OperatingAreaConfig: React.FC<OperatingAreaConfigProps> = ({ municipalityId, fallbackCenter }) => {
  const { t } = useLanguage();
  const { area, cityCenter, loading, saving, save } = useAdminOperatingArea(municipalityId);

  const [center, setCenter] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState([5]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const setCenterRef = useRef(setCenter);
  setCenterRef.current = setCenter;

  // Seed the form once the saved area (or the city's own centre) loads.
  useEffect(() => {
    if (loading) return;
    setCenter(area?.center ?? cityCenter ?? fallbackCenter);
    if (area) setRadius([area.radiusKm]);
  }, [loading, area, cityCenter, fallbackCenter]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current || !center) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    // Click to move the centre pin -- the same click-to-place gesture the
    // zone editor uses, so the two screens behave alike.
    map.on('click', (e) => setCenterRef.current([e.lngLat.lng, e.lngLat.lat]));
    map.getCanvas().style.cursor = 'crosshair';

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Runs once, as soon as an initial centre exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center !== null]);

  // Keep the pin and the circle in step with the form.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    const draw = () => {
      if (markerRef.current) {
        markerRef.current.setLngLat(center);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#2563eb', draggable: true })
          .setLngLat(center)
          .addTo(map);
        // Dragging the pin is the other half of the same gesture: click to
        // place roughly, drag to fine-tune.
        markerRef.current.on('dragend', () => {
          const { lng, lat } = markerRef.current!.getLngLat();
          setCenterRef.current([lng, lat]);
        });
      }

      const data = operatingAreaToGeoJson({ center, radiusKm: radius[0] });
      const source = map.getSource('area-preview') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource('area-preview', { type: 'geojson', data });
      map.addLayer({
        id: 'area-preview-fill',
        type: 'fill',
        source: 'area-preview',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: 'area-preview-outline',
        type: 'line',
        source: 'area-preview',
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 2] },
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [center, radius]);

  const handleSave = async () => {
    if (!center) return;
    const next: OperatingArea = { center, radiusKm: radius[0] };
    const { error } = await save(next);
    if (error) {
      toast({ title: t('area.saveFailed'), description: error, variant: 'destructive' });
      return;
    }
    toast({ title: t('area.saved'), description: t('area.savedDesc', { km: radius[0] }) });
  };

  if (!municipalityId) {
    return (
      <div className="glass-card rounded-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('zoning.noMunicipality')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 glass-card rounded-3xl p-4">
        <h3 className="font-bold">{t('area.mapTitle')}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">{t('area.mapDesc')}</p>
        <div className="h-[420px]">
          {MAPBOX_TOKEN ? (
            <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden" />
          ) : (
            <div className="h-full w-full rounded-2xl bg-secondary/50 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('area.noToken')}</p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 glass-card rounded-3xl p-6 space-y-6">
        <div>
          <h3 className="font-bold">{t('area.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('area.desc')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-secondary/50 p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-[11px]">{t('area.center')}</span>
              </div>
              <p className="text-sm font-mono">
                {center ? `${center[1].toFixed(5)}, ${center[0].toFixed(5)}` : '—'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('area.radius')}</Label>
                <span className="text-sm font-bold text-primary">{radius[0]} km</span>
              </div>
              <Slider value={radius} onValueChange={setRadius} min={1} max={50} step={1} />
              <p className="text-xs text-muted-foreground">{t('area.radiusDesc')}</p>
            </div>

            <Button className="w-full gap-2 rounded-2xl" disabled={!center || saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('area.save')}
            </Button>

            {!area && <p className="text-xs text-muted-foreground text-center">{t('area.unsetNotice')}</p>}
          </>
        )}
      </div>
    </div>
  );
};
