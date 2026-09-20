import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '../components/BrandMark';
import { useAppTheme } from '../design/ThemeProvider';
import { useSessionBootstrap } from '../hooks/useSessionBootstrap';
import { useSessionStore } from '../state/sessionStore';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { getRootNavigatorBranch } from './rootBranch';

export { getRootNavigatorBranch, type RootNavigatorBranch } from './rootBranch';

function SplashGate() {
  const { theme } = useAppTheme();
  const { colors, spacing, typography } = theme;
  return (
    <View accessibilityLabel="Loading Smart Air session" style={[styles.splash, { backgroundColor: colors.background }]}>
      <BrandMark size={80} />
      <Text style={[typography.h2, { color: colors.textPrimary, marginTop: spacing.xxxl }]}>Smart Air</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>Indoor Air Quality Monitor</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
    </View>
  );
}

export function RootNavigator() {
  useSessionBootstrap();
  const status = useSessionStore(state => state.status);
  switch (getRootNavigatorBranch(status)) {
    case 'loading':
      return <SplashGate />;
    case 'app':
      return <AppNavigator />;
    case 'auth':
      return <AuthNavigator />;
  }
}

const styles = StyleSheet.create({
  splash: { alignItems: 'center', flex: 1, justifyContent: 'center' },
});
