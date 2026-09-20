import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '../../components/BrandMark';
import type { AtmosphereTheme } from '../../design/theme';

interface AuthLayoutProps extends PropsWithChildren {
  theme: AtmosphereTheme;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, theme, title, subtitle }: AuthLayoutProps) {
  const { colors, spacing, typography } = theme;
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: spacing.xxxl, paddingVertical: spacing.huge }]}>
        <View style={styles.header}>
          <BrandMark />
          <Text style={[typography.h2, styles.title, { color: colors.textPrimary, marginTop: spacing.xxxl }]}>{title}</Text>
          <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary, marginTop: spacing.md }]}>{subtitle}</Text>
        </View>
        <View style={{ marginTop: spacing.huge }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 320 },
});
