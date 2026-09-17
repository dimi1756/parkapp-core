import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, FolderOpen, Loader2 } from 'lucide-react';

const CAR_SIZES = ['Mini', 'Compact', 'Sedan', 'SUV', 'XL / Van'] as const;

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function ExpiryBadge({ dateStr, label, t }: { dateStr: string; label: string; t: ReturnType<typeof useLanguage>['t'] }) {
  const days = daysUntil(dateStr);
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
        {t('glovebox.expired')}
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
        {t('glovebox.expiresIn')} {days}d
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 bg-yellow-500/10 px-2 py-0.5 rounded-full">
        {t('glovebox.expiresIn')} {days}d
      </span>
    );
  }
  return null;
}

export const GloveboxCard: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [expanded, setExpanded] = useState(false);
  const [carSize, setCarSize] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [kteo, setKteo] = useState('');
  const [carInsurance, setCarInsurance] = useState('');
  const [roadTax, setRoadTax] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setCarSize(profile.car_size ?? '');
    setDrivingLicense(profile.driving_license_expiry ?? '');
    setKteo(profile.kteo_expiry ?? '');
    setCarInsurance(profile.car_insurance_expiry ?? '');
    setRoadTax(profile.road_tax_expiry ?? '');
  }, [profile?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    // Push notification stubs — fire 30/7/1 days before expiry
    const fields = [drivingLicense, kteo, carInsurance, roadTax].filter(Boolean);
    for (const d of fields) {
      const days = daysUntil(d);
      if (days === 30 || days === 7 || days === 1) {
        // stub: replace with Capacitor Push Notifications when wired up
        console.warn(`[GloveboxCard] Document expires in ${days} day(s): ${d}`);
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        car_size: carSize || null,
        driving_license_expiry: drivingLicense || null,
        kteo_expiry: kteo || null,
        car_insurance_expiry: carInsurance || null,
        road_tax_expiry: roadTax || null,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (error) {
      // Raw PostgREST/network errors (e.g. a schema-cache miss on a column
      // that hasn't been migrated live yet) are logged for debugging but
      // never shown verbatim -- the driver sees a clear, localized message
      // instead of database internals.
      console.error('[GloveboxCard] save failed:', error);
      toast({ title: t('glovebox.saveFailed'), description: t('glovebox.saveFailedDesc'), variant: 'destructive' });
    } else {
      toast({ title: t('glovebox.saved') });
    }
  };

  const dateFields: { key: string; label: ReturnType<typeof t>; value: string; setter: (v: string) => void }[] = [
    { key: 'dl', label: t('glovebox.drivingLicense'), value: drivingLicense, setter: setDrivingLicense },
    { key: 'kteo', label: t('glovebox.kteo'), value: kteo, setter: setKteo },
    { key: 'ins', label: t('glovebox.carInsurance'), value: carInsurance, setter: setCarInsurance },
    { key: 'tax', label: t('glovebox.roadTax'), value: roadTax, setter: setRoadTax },
  ];

  return (
    <div className="glass-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{t('glovebox.title')}</p>
            <p className="text-xs text-muted-foreground">{t('glovebox.subtitle')}</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* Car size selector */}
          <div className="space-y-2">
            <Label>{t('glovebox.carSize')}</Label>
            <div className="flex flex-wrap gap-2">
              {CAR_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setCarSize(carSize === size ? '' : size)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    carSize === size
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry date fields */}
          {dateFields.map(({ key, label, value, setter }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="shrink-0">{label}</Label>
                {value && <ExpiryBadge dateStr={value} label={label} t={t} />}
              </div>
              <Input
                type="date"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full"
              />
            </div>
          ))}

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('glovebox.save')}
          </Button>
        </div>
      )}
    </div>
  );
};
