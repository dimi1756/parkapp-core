import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { AdminSidebar } from './AdminSidebar';
import { KPICards, type CityKpis } from './KPICards';
import { CityMap, type LiveSpot } from './CityMap';
import { WeeklyTrafficChart, type TrendDay } from './WeeklyTrafficChart';
import { BarChart3, TrendingUp, Calendar, RefreshCw, ShieldAlert, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export const AdminDashboard = () => {
  const { setAdminMode } = useApp();
  const { isAdmin, municipalityId, municipalityName, loading: accessLoading } = useAdminAccess();

  const [activeSection, setActiveSection] = useState('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [kpis, setKpis] = useState<CityKpis | null>(null);
  const [spots, setSpots] = useState<LiveSpot[]>([]);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!municipalityId) return;
    const [kpiRes, spotsRes, trendRes] = await Promise.all([
      supabase.rpc('admin_city_kpis', { p_municipality_id: municipalityId }),
      supabase.rpc('admin_live_spots', { p_municipality_id: municipalityId }),
      supabase.rpc('admin_weekly_trend', { p_municipality_id: municipalityId }),
    ]);
    setKpis(kpiRes.data?.[0] ?? null);
    setSpots(spotsRes.data ?? []);
    setTrend(trendRes.data ?? []);
    setDataLoading(false);
    setLastUpdated(new Date());
  }, [municipalityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Dashboard refreshed', description: 'Latest city data has been loaded.' });
  };

  // Defense in depth: even if something rendered this component without a
  // real municipality_admins row, it refuses to show real data or the shell.
  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin || !municipalityId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">Not authorized</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Your account isn't registered as a municipality administrator.
        </p>
        <Button onClick={() => setAdminMode(false)}>Back to App</Button>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <KPICards kpis={kpis} loading={dataLoading} />
            <CityMap spots={spots} loading={dataLoading} municipalityName={municipalityName} />
            <WeeklyTrafficChart trend={trend} loading={dataLoading} />
          </div>
        );
      case 'analytics':
        return (
          <div className="space-y-6">
            <div className="glass-card p-6 animate-fade-in">
              <h3 className="text-lg font-bold mb-4">Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-secondary/50 rounded-xl">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Community Reporting
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {kpis?.spots_declared_today ?? 0} spots reported today, {kpis?.active_spots_now ?? 0} currently active.
                  </p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-xl">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Driver Activity
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {kpis?.active_drivers_24h ?? 0} distinct drivers active in the last 24 hours.
                  </p>
                </div>
              </div>
            </div>
            <WeeklyTrafficChart trend={trend} loading={dataLoading} />
          </div>
        );
      case 'livemap':
        return <CityMap spots={spots} loading={dataLoading} municipalityName={municipalityName} tall />;
      case 'settings':
        return (
          <div className="glass-card p-6 animate-fade-in">
            <h3 className="text-lg font-bold mb-4">System Settings</h3>
            <div className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-xl">
                <h4 className="font-medium mb-2">Admin Notifications</h4>
                <p className="text-sm text-muted-foreground">Manage alerts for high occupancy and incidents.</p>
              </div>
              <div className="p-4 bg-secondary/50 rounded-xl">
                <h4 className="font-medium mb-2">Occupancy Thresholds</h4>
                <p className="text-sm text-muted-foreground">Set thresholds for zone occupancy alerts.</p>
              </div>
              <div className="p-4 bg-secondary/50 rounded-xl">
                <h4 className="font-medium mb-2">Data Export</h4>
                <p className="text-sm text-muted-foreground">Download reports in CSV or PDF format.</p>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} municipalityName={municipalityName} />

      <main className="flex-1 overflow-auto">
        <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-10 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {activeSection === 'overview' && 'Overview'}
                {activeSection === 'analytics' && 'Analytics'}
                {activeSection === 'livemap' && 'Live Map'}
                {activeSection === 'settings' && 'Settings'}
              </h1>
              <p className="text-sm text-muted-foreground">
                <Calendar className="h-3 w-3 inline mr-1" />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                <span className="mx-2">•</span>
                Last updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </header>

        <div className="p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
