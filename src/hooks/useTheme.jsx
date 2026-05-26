// [CREATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Theme provider and hook — manages dark/light/system preference, syncs with document class, persists to localStorage.

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  themeMode: 'system',
  resolvedTheme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

const THEME_KEY = 'fingas-theme';
const VALID_THEMES = new Set(['dark', 'light', 'system']);

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_KEY);
    return VALID_THEMES.has(saved) ? saved : 'system';
  });
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme());
  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const sync = () => setSystemTheme(media.matches ? 'light' : 'dark');
    sync();
    if (media.addEventListener) {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem(THEME_KEY, themeMode);
  }, [resolvedTheme, themeMode]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'system';
      return 'dark';
    });
  };

  const setTheme = (newTheme) => {
    if (VALID_THEMES.has(newTheme)) {
      setThemeState(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, themeMode, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
