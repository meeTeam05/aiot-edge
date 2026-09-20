/** Mirrors app/lib/design/tokens.dart. Feature code must consume these tokens. */
export const atmosphereTokens = {
  colors: {
    brand: '#0F6B5C', brandDeep: '#0A4F44', brandTint: '#E4F0EC', brandTint2: '#D5E8E1',
    accent: '#2C6BF0', accentTint: '#E5EEFD', warn: '#E07A1A', warnTint: '#FFF1DF',
    danger: '#D9462E', dangerTint: '#FFE5E0', amber: '#E8A33C', mint: '#BFE6D8',
  },
  spacing: { xxs: 2, xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20, xxxl: 24, huge: 32 },
  radius: { card: 22, button: 14, tile: 20, input: 16, pill: 999 },
} as const;

export type AtmosphereTokens = typeof atmosphereTokens;
