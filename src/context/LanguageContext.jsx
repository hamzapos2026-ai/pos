/**
 * LanguageContext.jsx — A One Jewelry POS
 * English/Urdu language support
 *
 * FIXED:
 * - React import added
 * - Error handling if translation files missing
 * - RTL support for Urdu
 */

import React, {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from 'react';

const LanguageContext = createContext(null);

export const LANGUAGES = {
  en: { name: 'English', nativeName: 'English', direction: 'ltr', flag: '🇬🇧' },
  ur: { name: 'Urdu',    nativeName: 'اردو',    direction: 'rtl', flag: '🇵🇰' },
};

// ── Load translations safely ──────────────────────────────────────────────────
const DEFAULT_TRANSLATIONS = { en: {}, ur: {} };

export const LanguageProvider = ({ children }) => {
  const [loadedTranslations, setLoadedTranslations] = useState(DEFAULT_TRANSLATIONS);
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem('aone-language')
        || localStorage.getItem('aone_language');
      return saved && LANGUAGES[saved] ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Current translations
  const translations = useMemo(() => (
    language === 'ur' ? loadedTranslations.ur : loadedTranslations.en
  ), [language, loadedTranslations]);

  // Apply DOM changes for RTL
  const applyLanguage = useCallback((lang) => {
    const cfg = LANGUAGES[lang] || LANGUAGES.en;
    document.documentElement.dir  = cfg.direction;
    document.documentElement.lang = lang;
  }, []);

  const setLanguage = useCallback((lang) => {
    if (!LANGUAGES[lang]) return;
    setLanguageState(lang);
    try {
      localStorage.setItem('aone-language', lang);
      localStorage.setItem('aone_language', lang);
    } catch {}
    applyLanguage(lang);
  }, [applyLanguage]);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'ur' : 'en');
  }, [language, setLanguage]);

  // Translation function with dot-notation key support + {{var}} interpolation
  const t = useCallback((key, fallback = '', vars = null) => {
    try {
      const keys  = key.split('.');
      let   value = translations;
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          value = null;
          break;
        }
      }
      let result = typeof value === 'string' ? value : (fallback || key);
      if (vars && typeof vars === 'object') {
        Object.entries(vars).forEach(([k, v]) => {
          result = String(result).replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
        });
      }
      return typeof result === 'string' ? result : String(fallback || key);
    } catch {
      return fallback || key;
    }
  }, [translations]);

  // Load translation files on mount and apply current language
  useEffect(() => {
    let mounted = true;
    const loadTranslations = async () => {
      try {
        const [enModule, urModule] = await Promise.all([
          import('../lang/en.json').catch(() => ({ default: {} })),
          import('../lang/ur.json').catch(() => ({ default: {} })),
        ]);
        if (!mounted) return;
        setLoadedTranslations({
          en: enModule?.default || {},
          ur: urModule?.default || {},
        });
      } catch (err) {
        console.warn('Translation files not found — using keys as fallback', err);
      } finally {
        if (mounted) setIsLoaded(true);
      }
    };

    loadTranslations();
    applyLanguage(language);

    return () => { mounted = false; };
  }, [applyLanguage, language]);

  const value = useMemo(() => ({
    language,
    isLoaded,
    setLanguage,
    toggleLanguage,
    t,
    translations,
    direction: LANGUAGES[language]?.direction || 'ltr',
    isRTL:     LANGUAGES[language]?.direction === 'rtl',
    languages: LANGUAGES,
  }), [language, isLoaded, setLanguage, toggleLanguage, t, translations]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

export default LanguageContext;