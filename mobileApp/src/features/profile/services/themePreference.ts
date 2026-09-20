import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedThemePreference = Exclude<ThemePreference, 'system'>;

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/** Flutter's AppState.themeMode equivalent. It is deliberately memory-only. */
export const useThemePreferenceStore = create<ThemePreferenceState>(set => ({
  preference: 'light',
  setPreference: preference => set({ preference }),
}));

export function resolveThemePreference(
  preference: ThemePreference,
  systemPreference: ResolvedThemePreference,
): ResolvedThemePreference {
  return preference === 'system' ? systemPreference : preference;
}
