import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ParkingZone } from '@/lib/zones';
import { X, ShieldCheck, Clock, Ban } from 'lucide-react';

interface ZoneInfoCardProps {
  zone: ParkingZone;
  onClose: () => void;
}

/**
 * Bottom sheet for a tapped parking zone -- same premium card language as
 * the off-street facility card.
 *
 * A shaded street the app quietly refuses to accept declarations on is a
 * mystery; a driver who taps it deserves to be told what the rule is and who
 * it protects. It's also the clearest way to show a mayor that the pilot
 * respects their controlled zones by design.
 */
export const ZoneInfoCard: React.FC<ZoneInfoCardProps> = ({ zone, onClose }) => {
  const { t } = useLanguage();
  const isResident = zone.kind === 'resident';

  // Red for residents-only, amber for controlled -- matching the map layer
  // the driver just tapped, so the card is unmistakably about that street.
  const accent = isResident ? '#dc2626' : '#f59e0b';

  return (
    <div className="absolute bottom-20 left-4 right-4 z-30 flex justify-center animate-fade-in">
      <div className="glass-card rounded-3xl p-5 shadow-2xl w-full max-w-sm relative">
        <button
          onClick={onClose}
          aria-label={t('spotCard.close')}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-3 pr-6">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            {isResident ? <ShieldCheck className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {t(isResident ? 'zoneCard.residentTitle' : 'zoneCard.controlledTitle')}
            </p>
            <p className="text-xs text-muted-foreground truncate">{zone.name}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {t(isResident ? 'zoneCard.residentDesc' : 'zoneCard.controlledDesc')}
        </p>

        <div className="flex items-start gap-2 rounded-2xl bg-secondary/50 p-3">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" style={{ color: accent }} />
          <p className="text-xs text-muted-foreground">{t('zoneCard.noReporting')}</p>
        </div>
      </div>
    </div>
  );
};
