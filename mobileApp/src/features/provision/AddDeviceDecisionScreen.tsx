import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../design/ThemeProvider';
import { HomeSelector } from '../home/components/HomeSelector';
import { useHomesQuery } from '../home/hooks/useHomeQueries';
import type { AppStackParamList } from '../../navigation/types';
import { getAddDeviceDestination } from './addDeviceDecision';

type Props = NativeStackScreenProps<AppStackParamList, 'AddDeviceDecision'>;

/** Route-level equivalent of Flutter's Home Add Device decision callback. */
export function AddDeviceDecisionScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const homesQuery = useHomesQuery();
  const homes = homesQuery.data ?? [];
  const destination = getAddDeviceDestination(homes, homesQuery.isLoading);

  useEffect(() => {
    if (destination.kind === 'createHome') navigation.replace('CreateHome');
    if (destination.kind === 'provision') navigation.replace('Provision', { homeId: destination.homeId });
  }, [destination, navigation]);

  if (destination.kind === 'chooseHome') {
    return (
      <HomeSelector
        homes={homes}
        onDismiss={() => navigation.goBack()}
        onSelect={homeId => navigation.replace('Provision', { homeId })}
        theme={theme}
        visible
      />
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.loading}><ActivityIndicator color={theme.colors.brand} /><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>Loading homes...</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 }, loading: { alignItems: 'center', flex: 1, justifyContent: 'center' } });
