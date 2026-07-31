import React from 'react';
import { Users, Clock, Gauge, ShieldCheck } from 'lucide-react';
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
  icon: React.ReactNode;
  color: string;
}

const KPICard = ({ title, value, icon, color }: KPICardProps) => (
  <div className="glass-card p-6 animate-fade-in">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
        {icon}
      </div>
    </div>
  </div>
);

interface KPICardsProps {
  kpis: CityKpis | null;
  loading: boolean;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, loading }) => {
  const { t, locale } = useLanguage();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: t('admin.kpiDrivers'),
      value: (kpis?.active_drivers_24h ?? 0).toLocaleString(locale),
      icon: <Users className="h-6 w-6 text-primary-foreground" />,
      color: 'bg-primary',
    },
    {
      title: t('admin.kpiSpotsToday'),
      value: (kpis?.spots_declared_today ?? 0).toLocaleString(locale),
      icon: <Gauge className="h-6 w-6 text-destructive-foreground" />,
      color: 'bg-destructive',
    },
    {
      title: t('admin.kpiAvgTime'),
      value: kpis?.avg_parking_minutes != null ? `${kpis.avg_parking_minutes} ${t('admin.min')}` : '—',
      icon: <Clock className="h-6 w-6 text-warning-foreground" />,
      color: 'bg-warning',
    },
    {
      title: t('admin.kpiTrust'),
      value: kpis?.avg_trust_score != null ? `${Math.round(kpis.avg_trust_score * 100)}%` : '—',
      icon: <ShieldCheck className="h-6 w-6 text-success-foreground" />,
      color: 'bg-success',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((kpi, index) => (
        <div key={kpi.title} style={{ animationDelay: `${index * 100}ms` }}>
          <KPICard {...kpi} />
        </div>
      ))}
    </div>
  );
};
