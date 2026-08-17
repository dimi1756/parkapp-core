import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPremiumActive } from '@/lib/membership';

interface AppState {
  points: number;
  darkMode: boolean;
  searchesToday: number;
  isAdmin: boolean;
}

interface AppContextType extends AppState {
  addPoints: (amount: number) => void;
  deductPoints: (amount: number) => boolean;
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
  const { profile } = useAuth();

  const [state, setState] = useState<AppState>({
    points: 150,
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

  const addPoints = (amount: number) => {
    setState(prev => ({ ...prev, points: prev.points + amount }));
  };

  const deductPoints = (amount: number): boolean => {
    if (state.points >= amount) {
      setState(prev => ({ ...prev, points: prev.points - amount }));
      return true;
    }
    return false;
  };

  const toggleDarkMode = () => {
    setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const incrementSearches = (): boolean => {
    if (isPremiumActive(profile) || state.searchesToday < 1) {
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
      addPoints,
      deductPoints,
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
