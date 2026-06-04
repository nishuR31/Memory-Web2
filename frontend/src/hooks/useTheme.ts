import { useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'graphpulse.theme.v1';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

function applyRootTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
}

export function useTheme() {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const resolvedTheme: ResolvedTheme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    applyRootTheme(themePreference, resolvedTheme);
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
  }, []);

  const cycleTheme = useCallback(() => {
    setThemePreferenceState((current) => {
      const next: ThemePreference = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
      cycleTheme,
    }),
    [cycleTheme, resolvedTheme, setThemePreference, themePreference]
  );
}
