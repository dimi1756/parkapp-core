import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminParkingZones } from '@/hooks/useParkingZones';
import { zoneCenter, type ZoneKind } from '@/lib/zones';
import { ZoneDrawMap } from './ZoneDrawMap';
import { Ban, Loader2, MapPin, Save, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

interface ZoningConfigProps {
  municipalityId: string | null;
  /** Where the drawing map opens. */
  center: [number, number];
}

/**
 * Zone management for the municipality dashboard -- the real thing now, not
 * the mock controls this used to be.
 *
 * An admin traces a street by clicking along it, names it, picks whether it
 * is residents-only or controlled, sets how wide the rule reaches, and
 * saves. The row goes to parking_zones (RLS-scoped to that municipality's
 * own admins) and the driver map picks it up on next load.
 *
 * This exists because hand-tracing zone coordinates in a source file put
 * them visibly off the actual streets. The people who know where the zone
 * boundaries really are work at the municipality; this hands them the pen.
 */
export const ZoningConfig: React.FC<ZoningConfigProps> = ({ municipalityId, center }) => {
  const { t } = useLanguage();
  const { zones, loading, error, createZone, deleteZone } = useAdminParkingZones(municipalityId);

  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ZoneKind>('resident');
  const [width, setWidth] = useState([28]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canSave = draftPoints.length >= 2 && name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const { error: saveError } = await createZone({
      name: name.trim(),
      kind,
      centerline: draftPoints,
      widthMeters: width[0],
    });
    setSaving(false);

    if (saveError) {
      toast({ title: t('zoning.saveFailed'), description: saveError, variant: 'destructive' });
      return;
    }
    toast({ title: t('zoning.saved'), description: t('zoning.savedDesc') });
    setDraftPoints([]);
    setName('');
  };

  const handleDelete = async (zoneId: string) => {
    setDeletingId(zoneId);
    const { error: deleteError } = await deleteZone(zoneId);
    setDeletingId(null);
    if (deleteError) {
      toast({ title: t('zoning.deleteFailed'), description: deleteError, variant: 'destructive' });
    }
  };

  if (!municipalityId) {
    return (
      <div className="glass-card rounded-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('zoning.noMunicipality')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Drawing surface */}
        <div className="lg:col-span-3 space-y-3">
          <div className="glass-card rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="font-bold">{t('zoning.drawTitle')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('zoning.drawDesc')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={draftPoints.length === 0}
                  onClick={() => setDraftPoints((points) => points.slice(0, -1))}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {t('zoning.undo')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={draftPoints.length === 0}
                  onClick={() => setDraftPoints([])}
                >
                  <X className="h-3.5 w-3.5" />
                  {t('zoning.clear')}
                </Button>
              </div>
            </div>

            <div className="h-[420px]">
              <ZoneDrawMap
                center={center}
                existingZones={zones}
                draftPoints={draftPoints}
                draftKind={kind}
                onAddPoint={(lng, lat) => setDraftPoints((points) => [...points, [lng, lat]])}
              />
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              {draftPoints.length === 0
                ? t('zoning.pointsNone')
                : t('zoning.pointsCount', { n: draftPoints.length })}
            </p>
          </div>
        </div>

        {/* Details for the zone being drawn */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-3xl p-6 space-y-5">
            <h3 className="font-bold">{t('zoning.detailsTitle')}</h3>

            <div className="space-y-2">
              <Label htmlFor="zoneName">{t('zoning.name')}</Label>
              <Input
                id="zoneName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('zoning.namePlaceholder')}
                className="rounded-2xl"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 p-4">
              <div className="min-w-0">
                <p className="font-medium text-sm">{t('zoning.kindResident')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {kind === 'resident' ? t('zoning.kindResidentDesc') : t('zoning.kindControlledDesc')}
                </p>
              </div>
              <Switch
                checked={kind === 'resident'}
                onCheckedChange={(on) => setKind(on ? 'resident' : 'controlled')}
                aria-label={t('zoning.kind')}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('zoning.radius')}</Label>
                <span className="text-sm font-bold text-primary">{width[0]}m</span>
              </div>
              <Slider value={width} onValueChange={setWidth} min={10} max={100} step={2} />
              <p className="text-xs text-muted-foreground">{t('zoning.radiusDesc')}</p>
            </div>

            <Button className="w-full gap-2 rounded-2xl" disabled={!canSave} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('zoning.save')}
            </Button>
            {draftPoints.length < 2 && (
              <p className="text-xs text-muted-foreground text-center">{t('zoning.needTwoPoints')}</p>
            )}
          </div>

          {/* Saved zones */}
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <h3 className="font-bold">{t('zoning.activeTitle')}</h3>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('zoning.emptyState')}</p>
            ) : (
              <div className="space-y-3">
                {zones.map((zone) => {
                  const isResident = zone.kind === 'resident';
                  const [lng, lat] = zoneCenter(zone);
                  return (
                    <div key={zone.id} className="rounded-2xl border border-border bg-secondary/30 p-4">
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
                            {t(isResident ? 'zoning.kindResident' : 'zoning.kindControlled')} · {zone.widthMeters}m ·{' '}
                            {lat.toFixed(4)}, {lng.toFixed(4)}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label={t('zoning.delete')}
                          disabled={deletingId === zone.id}
                          onClick={() => handleDelete(zone.id)}
                        >
                          {deletingId === zone.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
