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
        return <MapTab onNavigateToPlans={() => setActiveTab('plans')} onNavigateToOffers={() => setActiveTab('offers')} />;
      case 'offers':
        return <OffersTab />;
      case 'plans':
        return <PlansTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      case 'profile':
        return <ProfileTab />;
      default:
        return <MapTab onNavigateToPlans={() => setActiveTab('plans')} onNavigateToOffers={() => setActiveTab('offers')} />;
    }
  };

  return (
    // h-full rather than h-[100dvh]: #root is already pinned to the visible
    // viewport (see index.css / main.tsx), so inheriting that box is exact,
    // where re-deriving dvh here would reintroduce the very measurement iOS
    // gets wrong.
    <div className="h-full w-full max-w-md mx-auto bg-background flex flex-col overflow-hidden relative">
      {/* key remounts the pane per tab so each switch gets the fade-in.
          Every tab but the map gets the accent-tinted canvas behind it: the
          map is its own background, and laying a wash over it would only
          mute the thing the driver is reading. */}
      <div
        key={activeTab}
        className={`flex-1 overflow-hidden animate-fade-in ${activeTab === 'map' ? '' : 'app-canvas'}`}
      >
        {renderTab()}
      </div>

      <nav
        className="absolute bottom-0 left-0 right-0 bg-background/70 backdrop-blur-xl backdrop-saturate-150 border-t border-white/40 dark:border-white/10 px-2 pb-safe"
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
