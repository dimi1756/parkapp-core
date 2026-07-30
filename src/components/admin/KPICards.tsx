import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Users, Clock, Euro, Car } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string;
}

const KPICard = ({ title, value, change, trend, icon, color }: KPICardProps) => (
  <div className="glass-card p-6 animate-fade-in">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
        {change && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {trend === 'up' ? <TrendingUp className="h-4 w-4" /> : trend === 'down' ? <TrendingDown className="h-4 w-4" /> : null}
            <span>{change}</span>
          </div>
        )}
      </div>
      <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center`}>
        {icon}
      </div>
    </div>
  </div>
);

interface KPICardsProps {
  refreshKey?: number;
}

export const KPICards: React.FC<KPICardsProps> = ({ refreshKey = 0 }) => {
  // Deterministic-per-refresh jitter so pressing "Refresh" visibly nudges the
  // numbers, like a real live dashboard pulling fresh data.
  const kpis = useMemo(() => {
    const occupancyJitter = ((refreshKey * 3) % 7) - 3; // -3..+3
    const driversJitter = ((refreshKey * 17) % 41) - 20; // -20..+20
    const parkingTimeJitter = ((refreshKey * 5) % 3) - 1; // -1..+1
    const revenueJitter = ((refreshKey * 23) % 61) - 30; // -30..+30

    const occupancy = Math.min(99, Math.max(60, 85 + occupancyJitter));
    const drivers = Math.max(900, 1240 + driversJitter);
    const parkingTime = Math.max(6, 12 + parkingTimeJitter);
    const revenue = Math.max(200, 450 + revenueJitter);

    return [
      {
        title: 'City Occupancy',
        value: `${occupancy}%`,
        change: `${occupancyJitter >= 0 ? '+' : ''}${occupancyJitter}% from yesterday`,
        trend: occupancyJitter >= 0 ? ('up' as const) : ('down' as const),
        icon: <Car className="h-6 w-6 text-destructive-foreground" />,
        color: 'bg-destructive',
      },
      {
        title: 'Active Drivers',
        value: drivers.toLocaleString('en-US'),
        change: `${driversJitter >= 0 ? '+' : ''}${driversJitter} this hour`,
        trend: driversJitter >= 0 ? ('up' as const) : ('down' as const),
        icon: <Users className="h-6 w-6 text-primary-foreground" />,
        color: 'bg-primary',
      },
      {
        title: 'Avg. Parking Time',
        value: `${parkingTime} min`,
        change: `${parkingTimeJitter <= 0 ? '' : '+'}${parkingTimeJitter} min`,
        trend: parkingTimeJitter <= 0 ? ('down' as const) : ('up' as const),
        icon: <Clock className="h-6 w-6 text-warning-foreground" />,
        color: 'bg-warning',
      },
      {
        title: 'Revenue Today',
        value: `€${revenue.toFixed(2)}`,
        change: `${revenueJitter >= 0 ? '+' : ''}${Math.round((revenueJitter / 450) * 100)}% from yesterday`,
        trend: revenueJitter >= 0 ? ('up' as const) : ('down' as const),
        icon: <Euro className="h-6 w-6 text-success-foreground" />,
        color: 'bg-success',
      },
    ];
  }, [refreshKey]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpis.map((kpi, index) => (
        <div key={kpi.title} style={{ animationDelay: `${index * 100}ms` }}>
          <KPICard {...kpi} />
        </div>
      ))}
    </div>
  );
};
