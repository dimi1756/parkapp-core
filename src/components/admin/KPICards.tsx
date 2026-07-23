import React from 'react';
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

export const KPICards = () => {
  const kpis = [
    {
      title: 'City Occupancy',
      value: '85%',
      change: '+5% from yesterday',
      trend: 'up' as const,
      icon: <Car className="h-6 w-6 text-destructive-foreground" />,
      color: 'bg-destructive',
    },
    {
      title: 'Active Drivers',
      value: '1,240',
      change: '+12% this hour',
      trend: 'up' as const,
      icon: <Users className="h-6 w-6 text-primary-foreground" />,
      color: 'bg-primary',
    },
    {
      title: 'Avg. Parking Time',
      value: '12 min',
      change: '-2 min',
      trend: 'down' as const,
      icon: <Clock className="h-6 w-6 text-warning-foreground" />,
      color: 'bg-warning',
    },
    {
      title: 'Revenue Today',
      value: '€450.00',
      change: '+8% from yesterday',
      trend: 'up' as const,
      icon: <Euro className="h-6 w-6 text-success-foreground" />,
      color: 'bg-success',
    },
  ];

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
