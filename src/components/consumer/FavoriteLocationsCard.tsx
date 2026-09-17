import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, Briefcase, Dumbbell, Navigation, Loader2 } from 'lucide-react';

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
  const urls = {
    google: `comgooglemaps://?q=${q}`,
    apple: `http://maps.apple.com/?q=${q}`,
    waze: `waze://?q=${q}&navigate=yes`,
  };
  window.open(urls[app], '_blank');
}

export const FavoriteLocationsCard: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [home, setHome] = useState('');
  const [work, setWork] = useState('');
  const [gym, setGym] = useState('');
  const [saving, setSaving] = useState(false);
  const [navOpen, setNavOpen] = useState<FavKey | null>(null);

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
      setNavOpen(null);
    }
  };

  return (
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
          const isNavOpen = navOpen === key;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{icon}</span>
                <Label className="font-medium">{t(labelKey)}</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  value={val}
                  onChange={(e) => setters[key](e.target.value)}
                  placeholder={t('favorites.addressPlaceholder')}
                  className="flex-1"
                />
                {val.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNavOpen(isNavOpen ? null : key)}
                    className="shrink-0 rounded-xl px-3"
                  >
                    <Navigation className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {isNavOpen && val.trim() && (
                <div className="flex gap-2 flex-wrap pl-2">
                  <button
                    type="button"
                    onClick={() => openNav(val, 'google')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#4285F4]/10 text-[#4285F4] hover:bg-[#4285F4]/20 transition-colors border border-[#4285F4]/20"
                  >
                    <span>🗺</span> {t('favorites.googleMaps')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openNav(val, 'apple')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-secondary/60 text-foreground hover:bg-secondary transition-colors border border-border"
                  >
                    <span>🍎</span> {t('favorites.appleMaps')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openNav(val, 'waze')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#33CCFF]/10 text-[#33CCFF] hover:bg-[#33CCFF]/20 transition-colors border border-[#33CCFF]/20"
                  >
                    <span>🚗</span> {t('favorites.waze')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {t('favorites.save')}
      </Button>
    </div>
  );
};
