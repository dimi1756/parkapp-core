import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';

export interface TrendDay {
  day: string; // ISO date
  declarations: number;
}

interface WeeklyTrafficChartProps {
  trend: TrendDay[];
  loading: boolean;
}

export const WeeklyTrafficChart: React.FC<WeeklyTrafficChartProps> = ({ trend, loading }) => {
  const { t, locale } = useLanguage();
  const data = trend.map((d) => ({
    day: new Date(d.day).toLocaleDateString(locale, { weekday: 'short' }),
    declarations: Number(d.declarations),
  }));

  const total = data.reduce((sum, d) => sum + d.declarations, 0);

  return (
    <div className="glass-card p-6 h-80 animate-fade-in" style={{ animationDelay: '100ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">{t('admin.weeklyTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('admin.weeklySubtitle')}</p>
        </div>
        <div className="flex items-center gap-1 text-success text-sm font-semibold">
          <TrendingUp className="h-4 w-4" />
          {t('admin.total', { n: total })}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[calc(100%-40px)] rounded-xl" />
      ) : (
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--secondary))' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem',
                fontSize: '0.8rem',
              }}
              formatter={(value: number) => [value, t('admin.spotsDeclared')]}
            />
            <Bar dataKey="declarations" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
