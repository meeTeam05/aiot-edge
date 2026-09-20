import { StyleSheet, View } from 'react-native';

import type { AtmosphereTheme } from '../../../design/theme';

/** Mirrors Flutter's three fixed 140px neutral Home skeleton cards. */
export function HomeLoadingState({ theme }: { theme: AtmosphereTheme }) {
  return (
    <View style={{ paddingHorizontal: theme.spacing.xxl }} testID="home-loading-state">
      {[0, 1, 2].map(index => (
        <View key={index} style={[styles.skeleton, index === 2 ? undefined : styles.skeletonSpacing, { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.card }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ skeleton: { height: 140 }, skeletonSpacing: { marginBottom: 16 } });
