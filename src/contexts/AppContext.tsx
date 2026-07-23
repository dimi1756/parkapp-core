import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AppState {
  points: number;
  plan: 'free' | 'premium';
  citizenVerified: boolean;
  darkMode: boolean;
  searchesToday: number;
  isAdmin: boolean;
}

interface AppContextType extends AppState {
  addPoints: (amount: number) => void;
  deductPoints: (amount: number) => boolean;
  upgradeToPremium: () => void;
  verifyCitizen: () => void;
  toggleDarkMode: () => void;
  incrementSearches: () => boolean;
  setAdminMode: (isAdmin: boolean) => void;
  resetSearches: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>({
    points: 150,
    plan: 'free',
    citizenVerified: false,
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

  const upgradeToPremium = () => {
    setState(prev => ({ ...prev, plan: 'premium' }));
  };

  const verifyCitizen = () => {
    setState(prev => ({ ...prev, citizenVerified: true, plan: 'premium' }));
  };

  const toggleDarkMode = () => {
    setState(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const incrementSearches = (): boolean => {
    if (state.plan === 'premium' || state.searchesToday < 1) {
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
      upgradeToPremium,
      verifyCitizen,
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
