import { Platform } from 'react-native';

/**
 * The asset linker registers Android faces from their filenames and iOS faces
 * from the embedded family metadata. Both values map to Flutter's bundled fonts.
 */
export const fontFamily = Platform.select({
  android: { mono: 'JetBrainsMono-Regular', sans: 'PlusJakartaSans' },
  default: { mono: 'JetBrains Mono', sans: 'Plus Jakarta Sans' },
  ios: { mono: 'JetBrains Mono', sans: 'Plus Jakarta Sans' },
})!;

export const typography = {
  pageTitle: { fontFamily: fontFamily.sans, fontSize: 36, fontWeight: '700', letterSpacing: -0.9, lineHeight: 43 },
  h1: { fontFamily: fontFamily.sans, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, lineHeight: 31 },
  h2: { fontFamily: fontFamily.sans, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, lineHeight: 26 },
  sensorValue: { fontFamily: fontFamily.sans, fontSize: 30, fontWeight: '700', letterSpacing: -0.75, lineHeight: 36 },
  label: { fontFamily: fontFamily.sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, lineHeight: 14 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, fontWeight: '500', lineHeight: 20 },
  caption: { fontFamily: fontFamily.sans, fontSize: 13, fontWeight: '400', lineHeight: 18 },
  pill: { fontFamily: fontFamily.sans, fontSize: 11, fontWeight: '600', letterSpacing: 0.2, lineHeight: 14 },
  mono: { fontFamily: fontFamily.mono, fontSize: 13, fontWeight: '400', lineHeight: 18 },
} as const;
