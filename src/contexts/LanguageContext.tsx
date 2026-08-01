import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { STRINGS, StringKey } from '@/i18n/strings';

export type Language = 'en' | 'gr' | 'tr';

const LANGUAGE_KEY = 'parkapp_language';
const VALID_LANGUAGES: Language[] = ['en', 'gr', 'tr'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Translate a key, substituting {param} placeholders from `params`. */
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  /** BCP-47 locale for date/number formatting. */
  locale: string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return VALID_LANGUAGES.includes(stored as Language) ? (stored as Language) : 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem(LANGUAGE_KEY, lang);
    setLanguageState(lang);
  }, []);

  const t = useCallback(
    (key: StringKey, params?: Record<string, string | number>) => {
      let text: string = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [language]
  );

  const locale = language === 'gr' ? 'el-GR' : language === 'tr' ? 'tr-TR' : 'en-US';

  useEffect(() => {
    document.documentElement.lang = language === 'gr' ? 'el' : language === 'tr' ? 'tr' : 'en';
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, locale }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
