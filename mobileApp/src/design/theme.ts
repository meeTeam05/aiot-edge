import type { StatusBarStyle } from 'react-native';

import { darkColors, lightColors, type AtmosphereColors } from './colors';
import { atmosphereTokens } from './tokens';
import { typography } from './typography';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export interface AtmosphereTheme {
  mode: ResolvedThemeMode;
  colors: AtmosphereColors;
  spacing: typeof atmosphereTokens.spacing;
  radius: typeof atmosphereTokens.radius;
  typography: typeof typography;
  statusBarStyle: StatusBarStyle;
}

export function getTheme(mode: ResolvedThemeMode): AtmosphereTheme {
  const isDark = mode === 'dark';
  return {
    mode,
    colors: isDark ? darkColors : lightColors,
    spacing: atmosphereTokens.spacing,
    radius: atmosphereTokens.radius,
    typography,
    statusBarStyle: isDark ? 'light-content' : 'dark-content',
  };
}
