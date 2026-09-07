import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Navigation, X, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Rough urban driving speed used for the on-tap ETA estimate -- deliberately
// a quick heuristic rather than another live Directions API call for every
// pin tap (that round trip is reserved for the actual "Get Directions"
// commit, via the exact same routing path the search bar uses).
const ASSUMED_DRIVING_KMH = 25;

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function estimateEtaMinutes(meters: number): number {
  return Math.max(1, Math.round((meters / 1000 / ASSUMED_DRIVING_KMH) * 60));
}

function formatTimeSince(isoDate: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 1) return t('spotCard.justNow');
  return t('spotCard.minutesAgo', { n: minutes });
}

interface SpotDetailsCardProps {
  distanceMeters: number;
  declaredAt: string;
  onGetDirections: () => void;
  onClose: () => void;
}

/** Bottom card opened by tapping a live "mine"/"reported" spot pin --
 *  distance, freshness, a quick ETA estimate, and the entry point into the
 *  exact same turn-by-turn routing the search bar already uses. */
export const SpotDetailsCard: React.FC<SpotDetailsCardProps> = ({ distanceMeters, declaredAt, onGetDirections, onClose }) => {
  const { t } = useLanguage();
  // Re-render every 30s so "time since declared" keeps counting up while
  // the card stays open, instead of freezing at whatever it read on open.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute bottom-20 left-4 right-4 z-30 flex justify-center animate-fade-in">
      <div className="glass-card p-4 shadow-2xl w-full max-w-sm relative">
        <button
          onClick={onClose}
          aria-label={t('spotCard.close')}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-3 pr-6">
          <div className="w-9 h-9 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <MapPin className="h-4.5 w-4.5 text-success" />
          </div>
          <p className="font-semibold text-sm">{t('spotCard.title')}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center">
            <p className="text-lg font-bold">{formatDistance(distanceMeters)}</p>
            <p className="text-[11px] text-muted-foreground">{t('spotCard.distance')}</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="text-lg font-bold flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {formatTimeSince(declaredAt, t)}
            </p>
            <p className="text-[11px] text-muted-foreground">{t('spotCard.declared')}</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{estimateEtaMinutes(distanceMeters)}′</p>
            <p className="text-[11px] text-muted-foreground">{t('spotCard.eta')}</p>
          </div>
        </div>

        <Button onClick={onGetDirections} className="w-full gap-2">
          <Navigation className="h-4 w-4" />
          {t('spotCard.getDirections')}
        </Button>
      </div>
    </div>
  );
};
