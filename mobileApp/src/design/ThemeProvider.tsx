import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useThemePreferenceStore, resolveThemePreference, type ThemePreference } from '../features/profile/services/themePreference';
import { getTheme, type AtmosphereTheme, type ResolvedThemeMode } from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedMode: ResolvedThemeMode;
  setPreference: (preference: ThemePreference) => void;
  theme: AtmosphereTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Mirrors Flutter's in-memory AppState.themeMode at the application boundary. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useThemePreferenceStore(state => state.preference);
  const setPreference = useThemePreferenceStore(state => state.setPreference);
  const systemMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const resolvedMode = resolveThemePreference(preference, systemMode);
  const value = useMemo(() => ({ preference, resolvedMode, setPreference, theme: getTheme(resolvedMode) }), [preference, resolvedMode, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Provides the shared theme, while retaining a safe fallback for isolated screen tests. */
export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  const systemMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  if (value !== null) return value;
  const preference = useThemePreferenceStore.getState().preference;
  return {
    preference,
    resolvedMode: resolveThemePreference(preference, systemMode),
    setPreference: useThemePreferenceStore.getState().setPreference,
    theme: getTheme(resolveThemePreference(preference, systemMode)),
  };
}
