import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPremiumActive } from '@/lib/membership';

interface AppState {
  darkMode: boolean;
  searchesToday: number;
  isAdmin: boolean;
}

interface AppContextType extends AppState {
  toggleDarkMode: () => void;
  incrementSearches: () => boolean;
  setAdminMode: (isAdmin: boolean) => void;
  resetSearches: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  // `plan`/`citizenVerified`/`upgradeToPremium`/`verifyCitizen` used to live
  // here as plain client-side state, entirely disconnected from the real,
  // server-written profiles.membership_tier -- a page reload always reset
  // it back to 'free' regardless of an active trial or resident grant, and
  // the search-limit check below was enforcing against that fake state
  // instead of reality. Removed in favor of reading the real profile
  // (locked down server-side, see 0008/0009_*.sql) via useAuth().
  //
  // `points`/`addPoints`/`deductPoints` are gone for the same reason: they
  // were a second, purely client-side points counter seeded at a hardcoded
  // 150 that nothing ever read (every surface shows the real, server-written
  // profiles.points_balance) and nothing ever wrote. Dead state that could
  // only ever contradict the truth.
  const { profile, isDemoAccount } = useAuth();

  const [state, setState] = useState<AppState>({
    darkMode: false,
    searchesToday: 0,
    isAdmin: false,
  });

  useEffect(() => {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  const toggleDarkMode = () => {
    setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const incrementSearches = (): boolean => {
    // The shared demo/reviewer account is never rate-limited on searches.
    // The free tier's one-search-a-day cap is a real product rule, but on
    // the demo account it means the second search of a live presentation
    // opens an upgrade paywall instead of a route -- the same carve-out
    // declare-spot already makes for that account's rate limits.
    if (isDemoAccount || isPremiumActive(profile) || state.searchesToday < 1) {
      setState(prev => ({ ...prev, searchesToday: prev.searchesToday + 1 }));
      return true;
    }
    return false;
  };

  const setAdminMode = (isAdmin: boolean) => {
    setState(prev => ({ ...prev, isAdmin }));
  };

  const resetSearches = () => {
    setState(prev => ({ ...prev, searchesToday: 0 }));
  };

  return (
    <AppContext.Provider value={{
      ...state,
      toggleDarkMode,
      incrementSearches,
      setAdminMode,
      resetSearches,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
