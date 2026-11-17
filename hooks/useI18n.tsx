import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { translations, Lang, TranslationKey, getLang, setLang as persistLang, applyDir } from '@/constants/i18n';

interface I18nContextType {
  lang: Lang;
  t: (key: TranslationKey) => string;
  toggleLang: () => void;
  setLanguage: (lang: Lang) => void;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  useEffect(() => {
    const stored = getLang();
    setLangState(stored);
    applyDir(stored);
  }, []);

  const setLanguage = useCallback((newLang: Lang) => {
    setLangState(newLang);
    persistLang(newLang);
    applyDir(newLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLanguage(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLanguage]);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[lang][key] ?? translations.en[key] ?? key;
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang, setLanguage, isRTL: lang === 'ar' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
