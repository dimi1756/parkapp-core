import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import {
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_KEY,
  clampGlassOpacity,
  parseStoredPreferences,
  preferencesToCssVars,
  type AccentId,
  type UiPreferences,
} from '@/lib/uiPreferences';

interface UiPreferencesContextType extends UiPreferences {
  setAccent: (accent: AccentId) => void;
  /** 0.25 - 0.95; anything outside is clamped rather than refused. */
  setGlassOpacity: (opacity: number) => void;
  reset: () => void;
}

const UiPreferencesContext = createContext<UiPreferencesContextType | undefined>(undefined);

/** Writes the resolved variables onto the document root. */
function applyToDocument(prefs: UiPreferences): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(preferencesToCssVars(prefs))) {
    root.style.setProperty(name, value);
  }
}

/**
 * Appearance preferences: accent colour and glass opacity.
 *
 * The values live in React so the settings UI can render them, but the
 * styling they drive does not: both are written to CSS custom properties on
 * <html>, and every surface in the app already reads those. Dragging the
 * opacity slider therefore restyles the whole app continuously without a
 * single component re-rendering, which is what keeps it smooth on a phone.
 *
 * Applied synchronously on first render, before paint, so a stored accent
 * doesn't flash the default blue on every app open.
 */
export const UiPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [prefs, setPrefs] = useState<UiPreferences>(() => {
    try {
      const stored = parseStoredPreferences(localStorage.getItem(UI_PREFERENCES_KEY));
      applyToDocument(stored);
      return stored;
    } catch {
      // Private mode or storage disabled -- the defaults are already in the
      // stylesheet, so there is nothing to apply and nothing to repair.
      return DEFAULT_UI_PREFERENCES;
    }
  });

  useEffect(() => {
    applyToDocument(prefs);
    try {
      localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
  }, [prefs]);

  const setAccent = useCallback((accent: AccentId) => {
    setPrefs((prev) => ({ ...prev, accent }));
  }, []);

  const setGlassOpacity = useCallback((glassOpacity: number) => {
    setPrefs((prev) => ({ ...prev, glassOpacity: clampGlassOpacity(glassOpacity) }));
  }, []);

  const reset = useCallback(() => setPrefs(DEFAULT_UI_PREFERENCES), []);

  return (
    <UiPreferencesContext.Provider value={{ ...prefs, setAccent, setGlassOpacity, reset }}>
      {children}
    </UiPreferencesContext.Provider>
  );
};

export const useUiPreferences = () => {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error('useUiPreferences must be used within UiPreferencesProvider');
  }
  return context;
};
