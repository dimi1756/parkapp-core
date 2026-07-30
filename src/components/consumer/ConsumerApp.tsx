import React, { useState } from 'react';
import { MapTab } from './MapTab';
import { OffersTab } from './OffersTab';
import { PlansTab } from './PlansTab';
import { ProfileTab } from './ProfileTab';
import { Map, Gift, CreditCard, User } from 'lucide-react';

type TabType = 'map' | 'offers' | 'plans' | 'profile';

export const ConsumerApp = () => {
  const [activeTab, setActiveTab] = useState<TabType>('map');

  const tabs = [
    { id: 'map' as TabType, label: 'Map', icon: Map },
    { id: 'offers' as TabType, label: 'Offers', icon: Gift },
    { id: 'plans' as TabType, label: 'Plans', icon: CreditCard },
    { id: 'profile' as TabType, label: 'Profile', icon: User },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case 'map':
        return <MapTab />;
      case 'offers':
        return <OffersTab />;
      case 'plans':
        return <PlansTab />;
      case 'profile':
        return <ProfileTab />;
      default:
        return <MapTab />;
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col overflow-hidden relative">
      <div className="flex-1 overflow-hidden">
        {renderTab()}
      </div>

      <nav className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-2 pb-safe">
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all ${
                  isActive 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
