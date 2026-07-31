import React, { useMemo } from 'react';
import chalkidaHeatmap from '@/assets/chalkida-heatmap.png';

interface CityMapProps {
  refreshKey?: number;
}

export const CityMap: React.FC<CityMapProps> = ({ refreshKey = 0 }) => {
  const stats = useMemo(() => {
    const jitter = (seed: number, base: number, range: number) => {
      const j = ((refreshKey * seed) % (range * 2 + 1)) - range;
      return Math.min(99, Math.max(20, base + j));
    };
    return {
      downtown: jitter(11, 94, 4),
      beach: jitter(19, 88, 5),
      port: jitter(7, 62, 6),
    };
  }, [refreshKey]);

  const levelClass = (pct: number) =>
    pct >= 85 ? 'text-destructive' : pct >= 60 ? 'text-warning' : 'text-success';

  return (
    <div className="glass-card p-6 h-[500px] animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">City Map - Chalkida</h3>
          <p className="text-sm text-muted-foreground">Live availability view</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-warning" />
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span>Full</span>
          </div>
        </div>
      </div>
      
      <div className="relative h-[calc(100%-60px)] rounded-2xl overflow-hidden border border-border">
        <img 
          src={chalkidaHeatmap} 
          alt="Chalkida Heatmap" 
          className="w-full h-full object-cover"
        />

        <div className="absolute bottom-4 left-4 glass-card p-3">
          <div className="text-xs space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Downtown Spots:</span>
              <span className={`font-medium ${levelClass(stats.downtown)}`}>{stats.downtown}% Full</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Beach Spots:</span>
              <span className={`font-medium ${levelClass(stats.beach)}`}>{stats.beach}% Full</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Port Spots:</span>
              <span className={`font-medium ${levelClass(stats.port)}`}>{stats.port}% Full</span>
            </div>
          </div>
        </div>

        <div className="absolute top-4 right-4 glass-card px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-medium">Live</span>
        </div>

        <div className="absolute top-4 left-4 glass-card px-4 py-2">
          <span className="text-sm font-semibold">📍 Chalkida - Live Heatmap</span>
        </div>
      </div>
    </div>
  );
};
