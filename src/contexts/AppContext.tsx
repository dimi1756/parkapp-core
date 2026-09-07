import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDailySearchLimit } from '@/lib/membership';

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

// A "daily" allowance that resets on every page reload isn't an allowance at
// all -- which is what searchesToday was, living purely in React state. It's
// now stamped with the day it belongs to, so the count survives a reload and
// rolls over by itself at midnight local time.
//
// This is UX enforcement, not security: anyone can clear their own browser
// storage. Real enforcement belongs server-side alongside the other quota
// rules in the Edge Functions, and is deliberately still open work.
const SEARCH_COUNT_KEY = 'parkapp_searches_today';

function today(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function readTodaysSearchCount(): number {
  try {
    const raw = localStorage.getItem(SEARCH_COUNT_KEY);
    if (!raw) return 0;
    const { day, count } = JSON.parse(raw) as { day: string; count: number };
    return day === today() && Number.isFinite(count) ? count : 0;
  } catch {
    // Private mode, cleared storage, or a malformed value from an older
    // build -- start the day fresh rather than blocking searches outright.
    return 0;
  }
}

function persistSearchCount(count: number): void {
  try {
    localStorage.setItem(SEARCH_COUNT_KEY, JSON.stringify({ day: today(), count }));
  } catch {
    // Storage unavailable: the in-memory count still holds for this session.
  }
}

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

  const [state, setState] = useState<AppState>(() => ({
    darkMode: false,
    searchesToday: readTodaysSearchCount(),
    isAdmin: false,
  }));

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
    // The daily cap is a real product rule, but on the demo account it means
    // a paywall instead of a route partway through a live presentation --
    // the same carve-out declare-spot already makes for that account's rate
    // limits.
    if (isDemoAccount) {
      setState(prev => ({ ...prev, searchesToday: prev.searchesToday + 1 }));
      return true;
    }

    // Premium is a finite 5-a-day allowance now, not "unlimited" -- both
    // numbers come from getDailySearchLimit so this check and the Plans page
    // can never disagree about what a tier actually buys.
    if (state.searchesToday >= getDailySearchLimit(profile)) return false;

    setState(prev => {
      const next = prev.searchesToday + 1;
      persistSearchCount(next);
      return { ...prev, searchesToday: next };
    });
    return true;
  };

  const setAdminMode = (isAdmin: boolean) => {
    setState(prev => ({ ...prev, isAdmin }));
  };

  const resetSearches = () => {
    persistSearchCount(0);
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
