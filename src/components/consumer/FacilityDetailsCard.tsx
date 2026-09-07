import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  occupancyLevel,
  occupancyRatio,
  freeSpaces,
  OCCUPANCY_COLOR,
  type ParkingFacility,
} from '@/lib/parkingFacilities';
import { Navigation, X, Clock, Euro, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FacilityDetailsCardProps {
  facility: ParkingFacility;
  distanceMeters: number;
  onNavigate: () => void;
  onClose: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Bottom card for an off-street car park: how full it is, what it costs, and a way to drive there. */
export const FacilityDetailsCard: React.FC<FacilityDetailsCardProps> = ({
  facility,
  distanceMeters,
  onNavigate,
  onClose,
}) => {
  const { t, locale } = useLanguage();
  const level = occupancyLevel(facility);
  const ratio = occupancyRatio(facility);
  const free = freeSpaces(facility);
  const color = OCCUPANCY_COLOR[level];

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

        <div className="flex items-center gap-3 mb-4 pr-6">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{facility.name}</p>
            <p className="text-xs text-muted-foreground">
              {t(facility.kind === 'public' ? 'facility.public' : 'facility.private')} · {formatDistance(distanceMeters)}
            </p>
          </div>
        </div>

        {/* Occupancy bar -- the number that makes this layer worth showing. */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color }}>
              {t(`facility.level.${level}` as 'facility.level.low')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('facility.freeOf', { free, total: facility.capacity })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-secondary/50 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Euro className="h-3.5 w-3.5" />
              <span className="text-[11px]">{t('facility.price')}</span>
            </div>
            <p className="text-sm font-bold">
              {facility.pricePerHour === null
                ? t('facility.free')
                : t('facility.perHour', { price: facility.pricePerHour.toLocaleString(locale) })}
            </p>
          </div>
          <div className="rounded-2xl bg-secondary/50 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[11px]">{t('facility.hours')}</span>
            </div>
            <p className="text-sm font-bold">{facility.hours}</p>
          </div>
        </div>

        <Button onClick={onNavigate} className="w-full gap-2 rounded-2xl h-12">
          <Navigation className="h-4 w-4" />
          {t('facility.driveThere')}
        </Button>
      </div>
    </div>
  );
};
