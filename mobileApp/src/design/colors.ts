import { atmosphereTokens } from './tokens';

const { colors } = atmosphereTokens;

export const lightColors = {
  ...colors,
  textPrimary: '#0E1F1B', textSecondary: '#6E827D', textMuted: '#3F5751',
  border: '#E3EAE7', surfaceVariant: '#EEF3F1', background: '#F5F7F6', surface: '#FFFFFF',
  tileCool: '#E8F4EF', tileWarm: '#FFEFE3', tileAir: '#E5EEFD', tileNo2: '#F0E8FB',
} as const;

export const darkColors = {
  ...colors,
  brandTint: '#143C36', brandTint2: '#1B5048', accentTint: '#152643',
  warnTint: '#3A2410', dangerTint: '#3A1612', textPrimary: '#E8EEEC',
  textSecondary: '#8A9994', textMuted: '#B6C5C0', border: '#1F2A26',
  surfaceVariant: '#17211E', background: '#0B1411', surface: '#12201C',
  tileCool: '#143C36', tileWarm: '#3A2410', tileAir: '#152643', tileNo2: '#231538',
} as const;

export type AtmosphereColors = {
  [Key in keyof typeof lightColors]: string;
};
