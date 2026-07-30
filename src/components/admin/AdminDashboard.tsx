import React, { useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { KPICards } from './KPICards';
import { CityMap } from './CityMap';
import { WeeklyTrafficChart } from './WeeklyTrafficChart';
import { BarChart3, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export const AdminDashboard = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    // Simulate a real data pull so the spinner has something to show
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshKey((k) => k + 1);
    setLastUpdated(new Date());
    setIsRefreshing(false);
    toast({ title: 'Dashboard refreshed', description: 'Latest city data has been loaded.' });
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <KPICards refreshKey={refreshKey} />
            <CityMap refreshKey={refreshKey} />
            <WeeklyTrafficChart refreshKey={refreshKey} />
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
                    Traffic Trends
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Traffic rose by 15% in the last month, peaking between 12:00 and 14:00.
                  </p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-xl">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    App Usage
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    3,450 monthly active users, with 68% using search daily.
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 h-80 animate-fade-in" style={{ animationDelay: '100ms' }}>
              <h3 className="text-lg font-bold mb-4">Weekly Parking Distribution</h3>
              <div className="h-[calc(100%-40px)] flex items-end justify-around gap-4 px-4">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                  const heights = [75, 82, 90, 78, 95, 60, 45];
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg transition-all hover:from-primary/90"
                        style={{ height: `${heights[i]}%` }}
                      />
                      <span className="text-xs text-muted-foreground">{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 'livemap':
        return <CityMap refreshKey={refreshKey} />;
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
      <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      
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
