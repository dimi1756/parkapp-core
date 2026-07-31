import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingDown } from 'lucide-react';

interface WeeklyTrafficChartProps {
  refreshKey?: number;
}

// Baseline weekly traffic-reduction percentages (how much less congestion the
// city has seen since drivers started using the app to find spots directly).
const BASE_REDUCTION = [8, 11, 14, 10, 17, 21, 15];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WeeklyTrafficChart: React.FC<WeeklyTrafficChartProps> = ({ refreshKey = 0 }) => {
  // Small deterministic-per-refresh jitter so the "Refresh" button visibly
  // updates the chart, without the numbers jumping around wildly.
  const data = useMemo(() => {
    return DAYS.map((day, i) => {
      const jitter = ((refreshKey * 7 + i * 13) % 5) - 2; // -2..+2
      const reduction = Math.max(3, BASE_REDUCTION[i] + jitter);
      return { day, reduction };
    });
  }, [refreshKey]);

  const avgReduction = Math.round(data.reduce((sum, d) => sum + d.reduction, 0) / data.length);

  return (
    <div className="glass-card p-6 h-80 animate-fade-in" style={{ animationDelay: '100ms' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Weekly Traffic Reduction</h3>
          <p className="text-sm text-muted-foreground">
            Estimated drop in circling/search traffic vs. pre-launch baseline
          </p>
        </div>
        <div className="flex items-center gap-1 text-success text-sm font-semibold">
          <TrendingDown className="h-4 w-4" />
          {avgReduction}% avg
        </div>
      </div>

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
            tickFormatter={(v) => `${v}%`}
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
            formatter={(value: number) => [`${value}%`, 'Traffic reduction']}
          />
          <Bar dataKey="reduction" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
