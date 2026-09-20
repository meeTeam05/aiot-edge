import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Card, PrimaryButton } from '../../../components/ui';
import { useAppTheme } from '../../../design/ThemeProvider';
import type { AppStackParamList } from '../../../navigation/types';
import { useDeviceQuery } from '../../device/hooks/useDeviceDashboardQueries';
import { useRoomsQuery } from '../../home/hooks/useHomeQueries';
import { finalizeProvisioningHandoff } from '../../provisioning/session';
import { ProvisionSummaryRow } from './components/ProvisionSummaryRow';
import { provisionCompletionSummary } from './models/provisionCompletionModels';

type Props = NativeStackScreenProps<AppStackParamList, 'ProvisionComplete'>;

/** Final confirmation preserving Flutter's Device Detail destination behind an explicit success acknowledgement. */
export function ProvisionCompleteScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const queryClient = useQueryClient();
  const deviceQuery = useDeviceQuery(route.params.deviceId);
  const homeId = route.params.homeId ?? deviceQuery.data?.homeId ?? '';
  const roomsQuery = useRoomsQuery(homeId);
  const summaryUnavailable = route.params.deviceName === undefined || route.params.roomName === undefined;
  const roomNeedsLookup = route.params.roomName === undefined && deviceQuery.data?.roomId !== null && deviceQuery.data?.roomId !== undefined;
  const loading = summaryUnavailable && (deviceQuery.isLoading || (roomNeedsLookup && roomsQuery.isLoading));
  const summary = provisionCompletionSummary({ device: deviceQuery.data ?? undefined, deviceName: route.params.deviceName, roomName: route.params.roomName, rooms: roomsQuery.data });
  const continueToDevice = async () => {
    await finalizeProvisioningHandoff(queryClient, route.params.deviceId);
    navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'DeviceDetail', params: { deviceId: route.params.deviceId } }] });
  };

  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
    <View style={[styles.header, { paddingHorizontal: theme.spacing.xxl }]}><Pressable accessibilityLabel="Close completion" accessibilityRole="button" onPress={() => { continueToDevice().catch(() => undefined); }} testID="provision-complete-close"><AppIcon color={theme.colors.textPrimary} name="close" size={24} /></Pressable><Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Provisioning</Text><View style={styles.closeSpacer} /></View>
    <View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingVertical: theme.spacing.xxxl }]}><Card>
        {loading ? <View style={styles.loading} testID="provision-complete-loading"><ActivityIndicator color={theme.colors.brand} /><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Loading setup details…</Text></View> : <View testID="provision-complete-success"><View style={[styles.successIcon, { backgroundColor: theme.colors.brandTint }]}><AppIcon color={theme.colors.brand} name="check" size={36} /></View><Text style={[theme.typography.h2, styles.title, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>Device setup completed</Text><Text style={[theme.typography.body, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Your Smart Air device is ready to use.</Text><View style={{ marginTop: theme.spacing.xxxl }}><ProvisionSummaryRow label="Device name" value={summary.deviceName} /><ProvisionSummaryRow label="Assigned room" value={summary.roomName} /></View></View>}
      </Card></ScrollView>
      <PrimaryButton disabled={loading} label="Go to Device Detail" onPress={() => { continueToDevice().catch(() => undefined); }} testID="provision-complete-detail" />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', height: 52, justifyContent: 'space-between' }, closeSpacer: { width: 24 }, content: { flex: 1 }, scrollContent: { flexGrow: 1, justifyContent: 'center' }, loading: { alignItems: 'center', minHeight: 260, justifyContent: 'center' }, successIcon: { alignItems: 'center', borderRadius: 42, height: 84, justifyContent: 'center', width: 84 }, title: { textAlign: 'center' }, centered: { lineHeight: 22, textAlign: 'center' } });
