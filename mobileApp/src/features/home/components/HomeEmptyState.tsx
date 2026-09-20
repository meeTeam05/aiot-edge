import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AtmosphereTheme } from '../../../design/theme';

interface HomeEmptyStateProps {
  actionLabel: string;
  body: string;
  icon: string;
  onAction: () => void;
  testID: string;
  theme: AtmosphereTheme;
  title: string;
}

/** Token-based equivalent of Flutter's shared EmptyState atom. */
export function HomeEmptyState({ actionLabel, body, icon, onAction, testID, theme, title }: HomeEmptyStateProps) {
  const { colors, radius, spacing, typography } = theme;
  return (
    <View style={[styles.container, { padding: spacing.huge }]} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceVariant }]}><Text accessibilityLabel={title === 'No devices yet' ? 'No devices' : 'Warning'} style={[styles.icon, { color: colors.textSecondary }]}>{icon}</Text></View>
      <Text style={[typography.h1, styles.title, { color: colors.textPrimary, marginTop: spacing.xxxl }]}>{title}</Text>
      <Text style={[typography.body, styles.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>{body}</Text>
      <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.action, { backgroundColor: colors.brand, borderRadius: radius.button, marginTop: spacing.huge, opacity: pressed ? 0.8 : 1 }]}><Text style={[typography.body, { color: colors.surface }]}>{actionLabel}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  iconCircle: { alignItems: 'center', borderRadius: 60, height: 120, justifyContent: 'center', width: 120 },
  icon: { fontSize: 48 },
  title: { textAlign: 'center' },
  body: { maxWidth: 320, textAlign: 'center' },
  action: { alignItems: 'center', height: 52, justifyContent: 'center', minWidth: 160, paddingHorizontal: 24 },
});
