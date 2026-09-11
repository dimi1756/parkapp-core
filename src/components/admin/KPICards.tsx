import React, { useState } from 'react';
import { Users, Clock, Gauge, ShieldCheck, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';

export interface CityKpis {
  active_drivers_24h: number;
  spots_declared_today: number;
  active_spots_now: number;
  avg_parking_minutes: number | null;
  avg_trust_score: number | null;
}

interface KPICardProps {
  title: string;
  value: string;
  /** What this number actually counts. Revealed in place by the info button. */
  explanation: string;
  icon: React.ReactNode;
  color: string;
}

/**
 * A KPI, with its own definition one tap away.
 *
 * The explanation expands inside the card rather than floating in a hover
 * tooltip. Two reasons: the dashboard is read on phones and tablets as often
 * as on a desktop, and a hover tooltip is unreachable on a touch screen; and
 * a mayor being shown "average trust 94%" for the first time needs to know
 * what the app means by trust, which is not a fact that should require a
 * mouse to discover.
 */
const KPICard = ({ title, value, explanation, icon, color }: KPICardProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={t('admin.whatIsThis')}
              className="text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>

      {/* Expands the card downward rather than overlaying anything, so on a
          narrow screen it can never cover the number it is explaining. */}
      {open && (
        <p className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground leading-relaxed animate-fade-in">
          {explanation}
        </p>
      )}
    </div>
  );
};

interface KPICardsProps {
  kpis: CityKpis | null;
  loading: boolean;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, loading }) => {
  const { t, locale } = useLanguage();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: t('admin.kpiDrivers'),
      explanation: t('admin.kpiDriversInfo'),
      value: (kpis?.active_drivers_24h ?? 0).toLocaleString(locale),
      icon: <Users className="h-6 w-6 text-primary-foreground" />,
      color: 'bg-primary',
    },
    {
      title: t('admin.kpiSpotsToday'),
      explanation: t('admin.kpiSpotsTodayInfo'),
      value: (kpis?.spots_declared_today ?? 0).toLocaleString(locale),
      icon: <Gauge className="h-6 w-6 text-destructive-foreground" />,
      color: 'bg-destructive',
    },
    {
      title: t('admin.kpiAvgTime'),
      explanation: t('admin.kpiAvgTimeInfo'),
      value: kpis?.avg_parking_minutes != null ? `${kpis.avg_parking_minutes} ${t('admin.min')}` : '—',
      icon: <Clock className="h-6 w-6 text-warning-foreground" />,
      color: 'bg-warning',
    },
    {
      title: t('admin.kpiTrust'),
      explanation: t('admin.kpiTrustInfo'),
      value: kpis?.avg_trust_score != null ? `${Math.round(kpis.avg_trust_score * 100)}%` : '—',
      icon: <ShieldCheck className="h-6 w-6 text-success-foreground" />,
      color: 'bg-success',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((kpi, index) => (
        // The tour points at the first card rather than the whole grid.
        // On a phone the grid is a single column four cards tall -- taller
        // than the screen -- so spotlighting it dimmed nothing, and left the
        // tour card nowhere sensible to sit. One card makes the same point
        // and leaves room to explain it.
        <div
          key={kpi.title}
          style={{ animationDelay: `${index * 100}ms` }}
          {...(index === 0 ? { 'data-tour': 'admin-kpis' } : {})}
        >
          <KPICard {...kpi} />
        </div>
      ))}
    </div>
  );
};
