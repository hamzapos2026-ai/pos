/**
 * ThemeContext.jsx — A One Jewelry POS
 * Dark/Light mode context
 *
 * FIXED:
 * - React import added (required for JSX in some configs)
 * - isLoaded state prevents flash of wrong theme
 * - System theme change listener
 * - Proper cleanup
 */

import React, {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo,
} from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  // ✅ useState called INSIDE component — never outside
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('aone-theme');
      // Default: dark mode
      return saved !== 'light';
    } catch {
      return true;
    }
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Apply theme classes + meta to DOM
  const applyTheme = useCallback((dark) => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      root.classList.remove('light-mode');
      document.body.style.backgroundColor = '#0a0805';
      document.body.style.color = '#f5f5f4';
    } else {
      root.classList.remove('dark');
      root.classList.add('light-mode');
      document.body.style.backgroundColor = '#fafaf9';
      document.body.style.color = '#1c1917';
    }
    // Update PWA theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0a0805' : '#fafaf9');
  }, []);

  // Apply on mount + when isDark changes
  useEffect(() => {
    applyTheme(isDark);
    setIsLoaded(true);
  }, [isDark, applyTheme]);

  // System theme change (only if user hasn't manually set a preference)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      try {
        // Only follow system if no saved preference
        if (!localStorage.getItem('aone-theme')) {
          setIsDark(e.matches);
        }
      } catch {}
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      try { localStorage.setItem('aone-theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  }, []);

  const setTheme = useCallback((theme) => {
    const dark = theme === 'dark';
    setIsDark(dark);
    try { localStorage.setItem('aone-theme', theme); } catch {}
  }, []);

  const value = useMemo(() => ({
    isDark,
    isLoaded,
    toggleTheme,
    setTheme,
    theme: isDark ? 'dark' : 'light',
  }), [isDark, isLoaded, toggleTheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export default ThemeContext;