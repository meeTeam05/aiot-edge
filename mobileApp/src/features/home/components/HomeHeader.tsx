import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '../../../components/BrandMark';
import type { AtmosphereTheme } from '../../../design/theme';

export function HomeHeader({ onOpenHomes, theme }: { onOpenHomes?: () => void; theme: AtmosphereTheme }) {
  const { colors, spacing, typography } = theme;
  return (
    <>
      <View style={[styles.appBar, { backgroundColor: colors.background, paddingHorizontal: spacing.xl }]}>
        <BrandMark size={24} />
        <Text style={[styles.wordmark, { color: colors.textPrimary }]}>Atmosphere</Text>
      </View>
      <View style={{ paddingBottom: spacing.lg, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl }}>
        <View style={styles.titleRow}><Text style={[typography.pageTitle, { color: colors.textPrimary }]}>My Devices</Text>{onOpenHomes === undefined ? null : <Pressable accessibilityLabel="My homes" accessibilityRole="button" onPress={onOpenHomes} style={{ padding: spacing.sm }} testID="home-open-homes"><Text style={[typography.caption, { color: colors.brand }]}>My homes ›</Text></Pressable>}</View>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>Real-time environmental monitoring across your connected spaces.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  appBar: { alignItems: 'center', flexDirection: 'row', height: 56 },
  wordmark: { fontFamily: 'PlusJakartaSans', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
