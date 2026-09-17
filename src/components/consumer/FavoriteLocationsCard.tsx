import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, Briefcase, Dumbbell, Navigation, Loader2, X } from 'lucide-react';

type FavKey = 'home' | 'work' | 'gym';

interface FavRow {
  key: FavKey;
  icon: React.ReactNode;
  labelKey: 'favorites.home' | 'favorites.work' | 'favorites.gym';
}

const ROWS: FavRow[] = [
  { key: 'home', icon: <Home className="h-4 w-4" />, labelKey: 'favorites.home' },
  { key: 'work', icon: <Briefcase className="h-4 w-4" />, labelKey: 'favorites.work' },
  { key: 'gym', icon: <Dumbbell className="h-4 w-4" />, labelKey: 'favorites.gym' },
];

function openNav(address: string, app: 'google' | 'apple' | 'waze') {
  const q = encodeURIComponent(address);
  const urls: Record<typeof app, string> = {
    google: `comgooglemaps://?q=${q}`,
    apple: `http://maps.apple.com/?q=${q}`,
    waze: `waze://?q=${q}&navigate=yes`,
  };
  window.open(urls[app], '_blank');
}

interface NavSheetProps {
  address: string;
  label: string;
  onClose: () => void;
  t: ReturnType<typeof useLanguage>['t'];
}

const NavSheet: React.FC<NavSheetProps> = ({ address, label, onClose, t }) => (
  <>
    {/* scrim */}
    <div
      className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    />
    {/* sheet */}
    <div className="fixed inset-x-0 bottom-0 z-50 pb-safe animate-slide-up">
      <div className="mx-3 mb-3 glass-card rounded-3xl overflow-hidden shadow-2xl">
        {/* header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <p className="font-semibold">{t('favorites.openWith')}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[220px]">{address}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* nav options */}
        <div className="p-3 space-y-2">
          <button
            type="button"
            onClick={() => { openNav(address, 'google'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#4285F4]/10 hover:bg-[#4285F4]/20 transition-colors border border-[#4285F4]/20 text-left"
          >
            <span className="text-xl">🗺️</span>
            <span className="font-medium text-[#4285F4]">{t('favorites.googleMaps')}</span>
          </button>

          <button
            type="button"
            onClick={() => { openNav(address, 'apple'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-secondary/40 hover:bg-secondary transition-colors border border-border text-left"
          >
            <span className="text-xl">🍎</span>
            <span className="font-medium text-foreground">{t('favorites.appleMaps')}</span>
          </button>

          <button
            type="button"
            onClick={() => { openNav(address, 'waze'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#33CCFF]/10 hover:bg-[#33CCFF]/20 transition-colors border border-[#33CCFF]/20 text-left"
          >
            <span className="text-xl">🚗</span>
            <span className="font-medium text-[#00B4D8]">{t('favorites.waze')}</span>
          </button>
        </div>

        {/* cancel */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-secondary/60 hover:bg-secondary transition-colors text-sm font-semibold text-muted-foreground"
          >
            {t('favorites.cancel')}
          </button>
        </div>
      </div>
    </div>
  </>
);

export const FavoriteLocationsCard: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [home, setHome] = useState('');
  const [work, setWork] = useState('');
  const [gym, setGym] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<{ key: FavKey; label: string; address: string } | null>(null);

  const values: Record<FavKey, string> = { home, work, gym };
  const setters: Record<FavKey, (v: string) => void> = { home: setHome, work: setWork, gym: setGym };

  useEffect(() => {
    if (!profile) return;
    const fav = profile.favorite_locations;
    if (!fav) return;
    if (fav.home) setHome(fav.home);
    if (fav.work) setWork(fav.work);
    if (fav.gym) setGym(fav.gym);
  }, [profile?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        favorite_locations: {
          home: home.trim() || undefined,
          work: work.trim() || undefined,
          gym: gym.trim() || undefined,
        },
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      toast({ title: t('favorites.saveFailed'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('favorites.saved') });
    }
  };

  return (
    <>
      <div className="glass-card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Navigation className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{t('favorites.title')}</p>
            <p className="text-xs text-muted-foreground">{t('favorites.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-3">
          {ROWS.map(({ key, icon, labelKey }) => {
            const val = values[key];
            const label = t(labelKey);
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{icon}</span>
                  <Label className="font-medium">{label}</Label>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={val}
                    onChange={(e) => setters[key](e.target.value)}
                    placeholder={t('favorites.addressPlaceholder')}
                    className="flex-1"
                  />
                  {val.trim() && (
                    <button
                      type="button"
                      onClick={() => setSheet({ key, label, address: val.trim() })}
                      className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors border border-primary/20"
                      title={t('favorites.navigate')}
                    >
                      <Navigation className="h-4 w-4 text-primary" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t('favorites.save')}
        </Button>
      </div>

      {sheet && (
        <NavSheet
          address={sheet.address}
          label={sheet.label}
          onClose={() => setSheet(null)}
          t={t}
        />
      )}
    </>
  );
};
