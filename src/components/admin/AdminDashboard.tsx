import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { AdminSidebar } from './AdminSidebar';
import { KPICards, type CityKpis } from './KPICards';
import { CityMap, type LiveSpot } from './CityMap';
import { WeeklyTrafficChart, type TrendDay } from './WeeklyTrafficChart';
import { AdminSettings } from './AdminSettings';
import { ZoningConfig } from './ZoningConfig';
import { DemoTour, shouldShowTour } from '@/components/consumer/DemoTour';
import { BarChart3, TrendingUp, Calendar, RefreshCw, ShieldAlert, Loader2, Menu, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { MOCK_ADMIN_KPIS, getMockAdminSpots, getMockWeeklyTrend } from '@/lib/demoMockData';

const LIVE_SPOT_STATUSES: readonly LiveSpot['status'][] = ['active', 'claimed', 'expired', 'invalid', 'reported'];
function isLiveSpotStatus(value: string): value is LiveSpot['status'] {
  return (LIVE_SPOT_STATUSES as readonly string[]).includes(value);
}

export const AdminDashboard = () => {
  const { setAdminMode } = useApp();
  const { isDemoAccount } = useAuth();
  const { t, locale } = useLanguage();
  const { isAdmin, municipalityId, municipalityName, loading: accessLoading, error: accessError } = useAdminAccess();

  const [activeSection, setActiveSection] = useState('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [kpis, setKpis] = useState<CityKpis | null>(null);
  const [spots, setSpots] = useState<LiveSpot[]>([]);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!municipalityId) return;
    setDataError(null);

    // Investor-pitch mock stats for the shared demo account only -- a fresh
    // pilot database has too few real rows to look convincingly "in use"
    // during a live demo. See src/lib/demoMockData.ts. Skips the real RPCs
    // entirely (rather than blending) since partially-real KPI arithmetic
    // would read as nonsensical, unlike the map pins where blending is fine.
    if (isDemoAccount) {
      setKpis(MOCK_ADMIN_KPIS);
      setSpots(getMockAdminSpots());
      setTrend(getMockWeeklyTrend());
      setDataLoading(false);
      setLastUpdated(new Date());
      return;
    }

    const [kpiRes, spotsRes, trendRes] = await Promise.all([
      supabase.rpc('admin_city_kpis', { p_municipality_id: municipalityId }),
      supabase.rpc('admin_live_spots', { p_municipality_id: municipalityId }),
      supabase.rpc('admin_weekly_trend', { p_municipality_id: municipalityId }),
    ]);
    // Report the first failure rather than only the last -- any one of these
    // failing used to render silently as empty KPIs/map/chart with nothing
    // telling the admin their data might be incomplete.
    const firstError = kpiRes.error ?? spotsRes.error ?? trendRes.error;
    if (firstError) {
      console.error('[AdminDashboard] loadData failed:', firstError);
      setDataError(firstError.message);
    }
    setKpis(kpiRes.data?.[0] ?? null);
    // admin_live_spots returns status as plain text (the DB doesn't enforce
    // the enum) -- narrow at the boundary rather than trusting the RPC's
    // string type, so an unexpected value fails loud instead of silently
    // mis-typing as a LiveSpot['status'] it isn't.
    setSpots(
      (spotsRes.data ?? []).map((s) => {
        if (isLiveSpotStatus(s.status)) return { ...s, status: s.status };
        console.warn(`[AdminDashboard] unexpected spot status "${s.status}"`, s.id);
        return { ...s, status: 'invalid' as const };
      })
    );
    setTrend(trendRes.data ?? []);
    setDataLoading(false);
    setLastUpdated(new Date());
  }, [municipalityId, isDemoAccount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Demo-only tour, once data has actually loaded so the KPI/map targets
  // it points at are on screen to measure.
  useEffect(() => {
    if (isDemoAccount && !dataLoading && activeSection === 'overview' && shouldShowTour('admin')) {
      setShowTour(true);
    }
  }, [isDemoAccount, dataLoading, activeSection]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    if (dataError) {
      toast({ title: t('admin.dataLoadError'), description: dataError, variant: 'destructive' });
    } else {
      toast({ title: t('admin.refreshed'), description: t('admin.refreshedDesc') });
    }
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

  // Distinct from "not authorized" below -- this is "we couldn't even check",
  // which used to render as an infinite spinner (useAdminAccess never
  // resolved `loading`) or, after that fix, would otherwise fall through to
  // the misleading "not authorized" message for what's actually a network
  // failure.
  if (accessError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">{t('admin.accessError')}</h1>
        <p className="text-muted-foreground text-sm max-w-sm">{t('admin.accessErrorDesc')}</p>
        <Button onClick={() => window.location.reload()}>{t('admin.retry')}</Button>
      </div>
    );
  }

  if (!isAdmin || !municipalityId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">{t('admin.notAuthorized')}</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          {t('admin.notAuthorizedDesc')}
        </p>
        <Button onClick={() => setAdminMode(false)}>{t('admin.backToApp')}</Button>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div data-tour="admin-kpis">
              <KPICards kpis={kpis} loading={dataLoading} />
            </div>
            <div data-tour="admin-map">
              <CityMap spots={spots} loading={dataLoading} municipalityName={municipalityName} />
            </div>
            <WeeklyTrafficChart trend={trend} loading={dataLoading} />
          </div>
        );
      case 'analytics':
        return (
          <div className="space-y-6">
            <div className="glass-card p-6 animate-fade-in">
              <h3 className="text-lg font-bold mb-4">{t('admin.analytics')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-secondary/50 rounded-xl">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    {t('admin.communityReporting')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.communityReportingDesc', { today: kpis?.spots_declared_today ?? 0, active: kpis?.active_spots_now ?? 0 })}
                  </p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-xl">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    {t('admin.driverActivity')}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.driverActivityDesc', { n: kpis?.active_drivers_24h ?? 0 })}
                  </p>
                </div>
              </div>
            </div>
            <WeeklyTrafficChart trend={trend} loading={dataLoading} />
          </div>
        );
      case 'livemap':
        return <CityMap spots={spots} loading={dataLoading} municipalityName={municipalityName} tall />;
      case 'zoning':
        return <ZoningConfig />;
      case 'settings':
        return <AdminSettings municipalityId={municipalityId} spots={spots} trend={trend} />;
      default:
        return null;
    }
  };

  const sectionTitle: Record<string, string> = {
    overview: t('admin.overview'),
    analytics: t('admin.analytics'),
    livemap: t('admin.liveMap'),
    zoning: t('admin.zoning'),
    settings: t('admin.settings'),
  };

  return (
    // h-[100dvh] + overflow-hidden pins the shell to the *actual visible*
    // viewport (matching #root's own 100dvh in index.css) so <main> is the
    // one true scroll container. Plain h-screen (100vh) can be taller than
    // the visible area on iOS Safari while the address bar is showing,
    // clipping content at the bottom against #root's overflow:hidden.
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        municipalityName={municipalityName}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      <main className="w-full flex-1 min-w-0 overflow-y-auto">
        <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-10 px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden shrink-0"
                onClick={() => setMobileNavOpen(true)}
                aria-label={t('admin.openMenu')}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{sectionTitle[activeSection]}</h1>
                <p className="text-sm text-muted-foreground truncate">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  <span className="mx-2">•</span>
                  {t('admin.lastUpdated')} {lastUpdated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing ? t('admin.refreshing') : t('admin.refresh')}</span>
            </Button>
          </div>
        </header>

        <div className="p-4 md:p-8 pb-16">
          {dataError && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span className="truncate">{t('admin.dataLoadError')}</span>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleRefresh} disabled={isRefreshing}>
                {t('admin.retry')}
              </Button>
            </div>
          )}
          {renderContent()}
        </div>
      </main>

      {showTour && <DemoTour tourId="admin" onClose={() => setShowTour(false)} />}
    </div>
  );
};
