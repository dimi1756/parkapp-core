import React, { useEffect, useState } from 'react';
import { Bell, Gauge, Download, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMunicipalitySettings, type MunicipalitySettings } from '@/hooks/useMunicipalitySettings';
import type { LiveSpot } from './CityMap';
import type { TrendDay } from './WeeklyTrafficChart';

interface AdminSettingsProps {
  municipalityId: string | null;
  spots: LiveSpot[];
  trend: TrendDay[];
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ municipalityId, spots, trend }) => {
  const { t } = useLanguage();
  const { settings, loading, saving, save, loadError } = useMunicipalitySettings(municipalityId);
  const [form, setForm] = useState<MunicipalitySettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (loadError) {
      toast({ title: t('admin.settingsLoadError'), description: loadError, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  const dirty =
    form.notify_high_occupancy !== settings.notify_high_occupancy ||
    form.moderate_spot_threshold !== settings.moderate_spot_threshold ||
    form.full_spot_threshold !== settings.full_spot_threshold;

  const handleSave = async () => {
    if (form.moderate_spot_threshold >= form.full_spot_threshold) {
      toast({
        title: t('admin.settingsInvalid'),
        description: t('admin.settingsInvalidDesc'),
        variant: 'destructive',
      });
      return;
    }
    const { error } = await save(form);
    if (error) {
      toast({ title: t('admin.settingsSaveError'), description: error, variant: 'destructive' });
    } else {
      toast({ title: t('admin.settingsSaved'), description: t('admin.settingsSavedDesc') });
    }
  };

  const handleExportSpots = () => {
    if (spots.length === 0) {
      toast({ title: t('admin.exportEmpty'), description: t('admin.exportEmptyDesc') });
      return;
    }
    const rows: (string | number)[][] = [
      ['id', 'status', 'lat', 'lng', 'declared_at', 'expires_at'],
      ...spots.map((s) => [s.id, s.status, s.lat, s.lng, s.declared_at, s.expires_at]),
    ];
    downloadCsv(`parkapp-spots-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({ title: t('admin.exportReady'), description: t('admin.exportReadySpots', { n: spots.length }) });
  };

  const handleExportTrend = () => {
    if (trend.length === 0) {
      toast({ title: t('admin.exportEmpty'), description: t('admin.exportEmptyDesc') });
      return;
    }
    const rows: (string | number)[][] = [
      ['day', 'declarations'],
      ...trend.map((d) => [d.day, d.declarations]),
    ];
    downloadCsv(`parkapp-weekly-trend-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast({ title: t('admin.exportReady'), description: t('admin.exportReadyTrend') });
  };

  if (loading) {
    return (
      <div className="glass-card p-6 animate-fade-in space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-lg font-bold mb-4">{t('admin.systemSettings')}</h3>
      <div className="space-y-4">
        {/* Admin notifications */}
        <div className="p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-medium mb-1 flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                {t('admin.adminNotifs')}
              </h4>
              <p className="text-sm text-muted-foreground">{t('admin.adminNotifsDesc')}</p>
            </div>
            <Switch
              checked={form.notify_high_occupancy}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, notify_high_occupancy: checked }))}
            />
          </div>
        </div>

        {/* Occupancy thresholds */}
        <div className="p-4 bg-secondary/50 rounded-xl">
          <h4 className="font-medium mb-1 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            {t('admin.occupancy')}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">{t('admin.occupancyDesc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="moderate-threshold" className="text-xs text-muted-foreground">
                {t('admin.moderateThreshold')}
              </Label>
              <Input
                id="moderate-threshold"
                type="number"
                min={0}
                value={form.moderate_spot_threshold}
                onChange={(e) =>
                  setForm((f) => ({ ...f, moderate_spot_threshold: Math.max(0, Number(e.target.value)) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full-threshold" className="text-xs text-muted-foreground">
                {t('admin.fullThreshold')}
              </Label>
              <Input
                id="full-threshold"
                type="number"
                min={0}
                value={form.full_spot_threshold}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_spot_threshold: Math.max(0, Number(e.target.value)) }))
                }
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('admin.saveSettings')}
          </Button>
        </div>

        {/* Data export */}
        <div className="p-4 bg-secondary/50 rounded-xl">
          <h4 className="font-medium mb-1 flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            {t('admin.dataExport')}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">{t('admin.dataExportDesc')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportSpots} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              {t('admin.exportSpotsCsv')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportTrend} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              {t('admin.exportTrendCsv')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
