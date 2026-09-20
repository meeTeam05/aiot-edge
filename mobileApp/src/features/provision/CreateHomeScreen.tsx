import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../design/ThemeProvider';

/** Route placeholder for Flutter's /homes/create flow. */
export function CreateHomeScreen() {
  const { theme } = useAppTheme();
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>Create Home</Text></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, padding: 20 } });
