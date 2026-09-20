import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../design/ThemeProvider';
import { getTheme } from '../../design/theme';
import { DeviceSummaryCard } from './components/DeviceSummaryCard';
import { HomeEmptyState } from './components/HomeEmptyState';
import { HomeHeader } from './components/HomeHeader';
import { HomeLoadingState } from './components/HomeLoadingState';
import { HomeSelector } from './components/HomeSelector';
import { useActiveHomeDevicesQuery, useActiveHomeSelection, useHomesQuery } from './hooks/useHomeQueries';

interface HomeScreenProps {
  onAddDevice?: () => void;
  onCreateHome?: () => void;
  onOpenDevice?: (deviceId: string) => void;
  onProvisionHome?: (homeId: string) => void;
  onOpenHomes?: () => void;
}

/** Flutter Home tab: device summaries only; dashboard, controls, and realtime are deferred. */
export function HomeScreen({ onAddDevice, onCreateHome, onOpenDevice, onProvisionHome, onOpenHomes }: HomeScreenProps) {
  const { theme } = useAppTheme();
  const devicesQuery = useActiveHomeDevicesQuery();
  const homesQuery = useHomesQuery();
  useActiveHomeSelection(homesQuery.data ?? []);
  const [isHomeSelectorVisible, setHomeSelectorVisible] = useState(false);
  const { colors, spacing } = theme;

  const handleAddDevice = () => {
    if (onAddDevice !== undefined) {
      onAddDevice();
      return;
    }
    const homes = homesQuery.data ?? [];
    if (homesQuery.isLoading && homes.length === 0) {
      Alert.alert('Loading homes...');
      return;
    }
    if (homes.length === 0) {
      onCreateHome?.();
      return;
    }
    if (homes.length === 1) {
      const [home] = homes;
      if (home) onProvisionHome?.(home.id);
      return;
    }
    setHomeSelectorVisible(true);
  };

  const devices = devicesQuery.data ?? [];
  const listHeader = <HomeHeader onOpenHomes={onOpenHomes} theme={theme} />;

  if (devicesQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {listHeader}
        <HomeLoadingState theme={theme} />
        <AddDeviceButton onPress={handleAddDevice} theme={theme} />
      </SafeAreaView>
    );
  }

  if (devicesQuery.isError) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {listHeader}
        <HomeEmptyState actionLabel="Retry" body={getErrorMessage(devicesQuery.error)} icon="!" onAction={() => { devicesQuery.refetch().catch(() => undefined); }} testID="home-error-state" theme={theme} title="Failed to load devices" />
        <AddDeviceButton onPress={handleAddDevice} theme={theme} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <FlatList
        contentContainerStyle={devices.length === 0 ? styles.emptyList : { paddingBottom: spacing.huge }}
        data={devices}
        keyExtractor={device => device.id}
        ListEmptyComponent={<HomeEmptyState actionLabel="Add a device" body="Add your first Smart Air device to start monitoring air quality in your home." icon="◎" onAction={handleAddDevice} testID="home-empty-state" theme={theme} title="No devices yet" />}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.xl, paddingHorizontal: spacing.xxl }}>
            <DeviceSummaryCard device={item} onPress={onOpenDevice} theme={theme} />
          </View>
        )}
        testID="home-device-list"
      />
      <AddDeviceButton onPress={handleAddDevice} theme={theme} />
      <HomeSelector homes={homesQuery.data ?? []} onDismiss={() => setHomeSelectorVisible(false)} onSelect={homeId => { setHomeSelectorVisible(false); onProvisionHome?.(homeId); }} theme={theme} visible={isHomeSelectorVisible} />
    </SafeAreaView>
  );
}

function AddDeviceButton({ onPress, theme }: { onPress: () => void; theme: ReturnType<typeof getTheme> }) {
  const { colors, radius } = theme;
  return (
    <Pressable accessibilityLabel="Add a device" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.fab, { backgroundColor: colors.mint, borderRadius: radius.pill, opacity: pressed ? 0.8 : 1 }]} testID="home-add-device">
      <View style={[styles.fabHorizontal, { backgroundColor: colors.brand }]} />
      <View style={[styles.fabVertical, { backgroundColor: colors.brand }]} />
    </Pressable>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  emptyList: { flexGrow: 1 },
  fab: { alignItems: 'center', bottom: 24, elevation: 6, height: 56, justifyContent: 'center', position: 'absolute', right: 20, shadowColor: '#0F6B5C', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 12, width: 56 },
  fabHorizontal: { height: 2, position: 'absolute', width: 18 },
  fabVertical: { height: 18, position: 'absolute', width: 2 },
});
