import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapTab } from './MapTab';
import { OffersTab } from './OffersTab';
import { PlansTab } from './PlansTab';
import { ProfileTab } from './ProfileTab';
import { LeaderboardTab } from './LeaderboardTab';
import { DemoTour, shouldShowTour, dismissTour, type TourId } from './DemoTour';
import { Map, Gift, CreditCard, User, Trophy } from 'lucide-react';

type TabType = 'map' | 'offers' | 'plans' | 'profile' | 'leaderboard';

export const ConsumerApp = () => {
  const { isDemoAccount } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [activeTour, setActiveTour] = useState<TourId | null>(null);
  const prevTabRef = useRef<TabType | null>(null);

  // Demo-only: each tab greets the reviewer with its own short tour the
  // first time they open it. Leaving a tab mid-tour counts as dismissing
  // that tab's tour — no nagging on the way back.
  useEffect(() => {
    if (!isDemoAccount) return;
    const prevTab = prevTabRef.current;
    if (prevTab && prevTab !== activeTab) {
      dismissTour(prevTab);
    }
    prevTabRef.current = activeTab;
    setActiveTour(shouldShowTour(activeTab) ? activeTab : null);
  }, [activeTab, isDemoAccount]);

  const tabs = [
    { id: 'map' as TabType, label: t('nav.map'), icon: Map },
    { id: 'offers' as TabType, label: t('nav.offers'), icon: Gift },
    { id: 'plans' as TabType, label: t('nav.plans'), icon: CreditCard },
    { id: 'leaderboard' as TabType, label: t('nav.leaderboard'), icon: Trophy },
    { id: 'profile' as TabType, label: t('nav.profile'), icon: User },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case 'map':
        return <MapTab onNavigateToPlans={() => setActiveTab('plans')} />;
      case 'offers':
        return <OffersTab />;
      case 'plans':
        return <PlansTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      case 'profile':
        return <ProfileTab />;
      default:
        return <MapTab onNavigateToPlans={() => setActiveTab('plans')} />;
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col overflow-hidden relative">
      {/* key remounts the pane per tab so each switch gets the fade-in */}
      <div key={activeTab} className="flex-1 overflow-hidden animate-fade-in">
        {renderTab()}
      </div>

      <nav
        className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-2 pb-safe"
        data-tour="nav"
      >
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                <span className="text-[11px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {activeTour === activeTab && activeTour && (
        <DemoTour tourId={activeTour} onClose={() => setActiveTour(null)} />
      )}
    </div>
  );
};
