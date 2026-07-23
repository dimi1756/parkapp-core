import React from 'react';
import chalkidaHeatmap from '@/assets/chalkida-heatmap.png';

export const CityMap = () => {
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
              <span className="font-medium text-destructive">94% Full</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Beach Spots:</span>
              <span className="font-medium text-destructive">88% Full</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Port Spots:</span>
              <span className="font-medium text-warning">62% Full</span>
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
