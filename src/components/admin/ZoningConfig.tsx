import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { KARYSTOS_ZONES, type ZoneKind } from '@/lib/zones';
import { Ban, Info, MapPin, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

/**
 * Zone management for the municipality dashboard.
 *
 * PROTOTYPE SURFACE, ON PURPOSE. Nothing here writes anything: the controls
 * edit local React state and "save" reports back that persistence isn't
 * built yet. It exists so a mayor can see the shape of the tool they'd be
 * buying -- pick a street, declare it residents-only, set how wide the
 * protected corridor runs -- while the zones the app actually enforces stay
 * exactly the ones defined in src/lib/zones.ts.
 *
 * Making it real means: a parking_zones table (municipality_id, kind,
 * PostGIS geometry) with is_municipality_admin() RLS to match
 * municipality_settings, replacing the hardcoded array, and moving the
 * declaration-time check server-side into declare-spot so it can't be
 * bypassed by a modified client. The banner below says as much on screen,
 * so nobody in the room mistakes this for a working control.
 */
export const ZoningConfig = () => {
  const { t } = useLanguage();

  const [selectedZoneId, setSelectedZoneId] = useState(KARYSTOS_ZONES[0]?.id ?? '');
  const [kind, setKind] = useState<ZoneKind>(KARYSTOS_ZONES[0]?.kind ?? 'resident');
  const [enabled, setEnabled] = useState(true);
  const [radius, setRadius] = useState([30]);

  const selectedZone = KARYSTOS_ZONES.find((z) => z.id === selectedZoneId);

  const handleSelectZone = (id: string) => {
    setSelectedZoneId(id);
    const zone = KARYSTOS_ZONES.find((z) => z.id === id);
    if (zone) setKind(zone.kind);
  };

  return (
    <div className="space-y-6">
      {/* Stated up front rather than in a footnote: an investor demo that
          implies a working write path it doesn't have is the kind of thing
          that surfaces badly in due diligence. */}
      <div className="glass-card rounded-3xl p-4 flex items-start gap-3 bg-primary/5 border-primary/20">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">{t('zoning.previewNotice')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-3xl p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold">{t('zoning.editorTitle')}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t('zoning.editorDesc')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('zoning.street')}</Label>
            <Select value={selectedZoneId} onValueChange={handleSelectZone}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KARYSTOS_ZONES.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('zoning.kind')}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ZoneKind)}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resident">{t('zoning.kindResident')}</SelectItem>
                <SelectItem value="controlled">{t('zoning.kindControlled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 p-4">
            <div className="min-w-0">
              <p className="font-medium text-sm">{t('zoning.enabled')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('zoning.enabledDesc')}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('zoning.radius')}</Label>
              <span className="text-sm font-bold text-primary">{radius[0]}m</span>
            </div>
            <Slider value={radius} onValueChange={setRadius} min={10} max={100} step={5} />
            <p className="text-xs text-muted-foreground">{t('zoning.radiusDesc')}</p>
          </div>

          <Button
            className="w-full gap-2 rounded-2xl"
            onClick={() => toast({ title: t('zoning.saveUnavailable'), description: t('zoning.saveUnavailableDesc') })}
          >
            <Save className="h-4 w-4" />
            {t('zoning.save')}
          </Button>
        </div>

        <div className="glass-card rounded-3xl p-6 space-y-4">
          <h3 className="text-lg font-bold">{t('zoning.activeTitle')}</h3>

          <div className="space-y-3">
            {KARYSTOS_ZONES.map((zone) => {
              const isResident = zone.kind === 'resident';
              return (
                <div
                  key={zone.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    zone.id === selectedZoneId ? 'border-primary/50 bg-primary/5' : 'border-border bg-secondary/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isResident ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {isResident ? <Ban className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{zone.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(isResident ? 'zoning.kindResident' : 'zoning.kindControlled')}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-success/15 text-success shrink-0">
                      {t('zoning.statusActive')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-secondary/50 p-4">
            <p className="text-sm font-medium">{t('zoning.impactTitle')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('zoning.impactDesc', { n: KARYSTOS_ZONES.length, street: selectedZone?.name ?? '' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
