import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../design/ThemeProvider';
import type { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Provision'>;

/** Route placeholder for Flutter's /provision?homeId=… five-step flow. */
export function ProvisionScreen({ route }: Props) {
  const { theme } = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Text style={[theme.typography.h1, { color: theme.colors.textPrimary }]}>Add Device</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Home ID: {route.params.homeId}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, padding: 20 } });
