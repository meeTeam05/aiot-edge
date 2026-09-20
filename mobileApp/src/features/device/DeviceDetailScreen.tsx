import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../design/ThemeProvider';
import type { AppStackParamList } from '../../navigation/types';
import {
  DashboardAppBar,
  DashboardBlockingState,
  DeviceModeSummary,
  RecentActivity,
  RelayStatusCard,
  SensorCard,
} from './components/DeviceDashboardBlocks';
import {
  useDeviceCommandHistoryQuery,
  useDeviceQuery,
  useDeviceShadowQuery,
  useDeviceTelemetryQuery,
} from './hooks/useDeviceDashboardQueries';
import { useDeviceControls } from './hooks/useDeviceControls';
import type { TelemetryPoint } from './models/deviceModels';
import { useRoomsQuery } from '../home/hooks/useHomeQueries';

type Props = NativeStackScreenProps<AppStackParamList, 'DeviceDetail'>;

/** Flutter-equivalent dashboard whose displayed controls remain reported-shadow authoritative. */
export function DeviceDetailScreen({ route, navigation }: Props) {
  const { theme } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const deviceId = route.params.deviceId;
  const telemetryRequest = useStableLiveTelemetryRequest();
  const deviceQuery = useDeviceQuery(deviceId);
  const shadowQuery = useDeviceShadowQuery(deviceId);
  const telemetryQuery = useDeviceTelemetryQuery(deviceId, telemetryRequest);
  const commandsQuery = useDeviceCommandHistoryQuery(deviceId);
  const device = deviceQuery.data;
  const roomsQuery = useRoomsQuery(device?.homeId ?? '');
  const shadow = shadowQuery.data;
  const controls = useDeviceControls({ commands: commandsQuery.data ?? [], deviceId, refetchShadow: shadowQuery.refetch, shadow: shadow ?? null });

  const blockingError = getBlockingError({
    device,
    deviceError: deviceQuery.error,
    deviceFailed: deviceQuery.isError,
    shadow,
    shadowError: shadowQuery.error,
    shadowFailed: shadowQuery.isError,
    telemetry: telemetryQuery.data,
    telemetryError: telemetryQuery.error,
    telemetryFailed: telemetryQuery.isError,
  });
  const isLoading = blockingError === null && (deviceQuery.isLoading || shadowQuery.isLoading || telemetryQuery.isLoading);
  const retry = () => { Promise.all([deviceQuery.refetch(), shadowQuery.refetch(), telemetryQuery.refetch(), commandsQuery.refetch()]).catch(() => undefined); };

  if (blockingError !== null || isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <DashboardAppBar onBack={() => goBack(navigation)} onSettings={() => undefined} theme={theme} title={device?.name ?? deviceId} />
        <DashboardBlockingState error={blockingError ?? undefined} loading={isLoading} onRetry={retry} theme={theme} title={device?.name ?? deviceId} />
      </SafeAreaView>
    );
  }

  const reported = shadow?.reported ?? {};
  const mode = typeof reported.mode === 'string' && reported.mode.toLowerCase() === 'on' ? 'on' : 'off';
  const liveTelemetry = (telemetryQuery.data ?? []).filter(point => isLiveTelemetryPoint(point));
  const latestTelemetry = latest(liveTelemetry);
  const telemetryOrReported = (value: number | null | undefined, reportedKey: string): number | null => value ?? numberFromReported(reported[reportedKey]);
  const isOn = mode === 'on';
  // Flutter uses the post-padding LayoutBuilder width (screen width minus 40px here).
  const { compactSensors, contentWidth, relayColumns } = dashboardLayout(width, fontScale, theme.spacing.xxl);
  const relayWidth = relayColumns === 1 ? contentWidth : (contentWidth - theme.spacing.lg) / relayColumns;
  const roomName = device?.roomId === null
    ? 'No room assigned'
    : roomsQuery.isLoading
      ? 'Loading room…'
      : roomsQuery.data?.find(room => room.id === device?.roomId)?.name ?? 'Room unavailable';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <DashboardAppBar onBack={() => goBack(navigation)} onSettings={() => navigation.navigate('DeviceSettings', { deviceId })} theme={theme} title={device?.name ?? deviceId} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xxl, paddingBottom: theme.spacing.huge }} refreshControl={<RefreshControl onRefresh={retry} refreshing={deviceQuery.isRefetching || shadowQuery.isRefetching || telemetryQuery.isRefetching || commandsQuery.isRefetching} tintColor={theme.colors.brand} />}>
        <View style={[styles.statusRow, { marginBottom: theme.spacing.xl }]} testID="device-status">
          <Text style={[theme.typography.caption, { color: device?.online ? theme.colors.brand : theme.colors.textSecondary }]}>{presenceText(device?.online ?? false, device?.lastSeen ?? null)}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]} testID="device-room">{roomName}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{device?.firmwareVer === null || device?.firmwareVer === undefined ? 'Firmware unavailable' : `Firmware ${device.firmwareVer}`}</Text>
        </View>
        <DeviceModeSummary disabled={controls.mode.isPending} loading={controls.mode.isPending} mode={mode} online={device?.online ?? false} onToggle={nextMode => handleModeToggle(nextMode, controls.mode.submit)} theme={theme} />
        <View style={[styles.sensorGrid, { marginTop: theme.spacing.xxl }]}>
          <SensorCard compact={compactSensors} dimmed={!isOn} index={0} label="Temperature" sparkColor={theme.colors.danger} sparkline={recentMetricValues(liveTelemetry, point => point.temperature)} theme={theme} unit="°C" value={telemetryOrReported(latestTelemetry?.temperature, 'temperature')} />
          <SensorCard compact={compactSensors} dimmed={!isOn} index={1} label="Humidity" sparkColor={theme.colors.accent} sparkline={recentMetricValues(liveTelemetry, point => point.humidity)} theme={theme} unit="%" value={telemetryOrReported(latestTelemetry?.humidity, 'humidity')} />
          <SensorCard compact={compactSensors} dimmed={!isOn} index={2} label="CO" sparkColor={theme.colors.brand} sparkline={recentMetricValues(liveTelemetry, point => point.coPpm)} theme={theme} unit="ppm" value={telemetryOrReported(latestTelemetry?.coPpm, 'co_ppm')} />
          <SensorCard compact={compactSensors} dimmed={!isOn} index={3} label="NO₂" sparkColor="#7A4FD0" sparkline={recentMetricValues(liveTelemetry, point => point.no2Ppm)} theme={theme} unit="ppm" value={telemetryOrReported(latestTelemetry?.no2Ppm, 'no2_ppm')} />
        </View>
        <View style={{ marginTop: theme.spacing.xxxl }}>
          <Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>Relays</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>· 3 channels</Text>
          <View style={[styles.relayGrid, { marginTop: theme.spacing.lg }]}>
            <RelayStatusCard channel={1} disabled={!isOn || controls.fan.isPending} loading={controls.fan.isPending} name="Fan" on={reported.relay_1 === true} onToggle={() => { if (isOn) controls.fan.submit(reported.relay_1 !== true); }} theme={theme} width={relayWidth} />
            <RelayStatusCard channel={2} disabled={!isOn || controls.lamp.isPending} loading={controls.lamp.isPending} name="Lamp" on={reported.relay_2 === true} onToggle={() => { if (isOn) controls.lamp.submit(reported.relay_2 !== true); }} theme={theme} width={relayWidth} />
            <RelayStatusCard channel={3} disabled={!isOn || controls.filter.isPending} loading={controls.filter.isPending} name="Filter" on={reported.relay_3 === true} onToggle={() => { if (isOn) controls.filter.submit(reported.relay_3 !== true); }} theme={theme} width={relayWidth} />
          </View>
          {controlFeedback(controls) !== null ? <Text style={[theme.typography.caption, { color: controlFeedback(controls)?.state === 'failure' ? theme.colors.danger : theme.colors.warn, marginTop: theme.spacing.md }]} testID="device-control-feedback">{controlFeedback(controls)?.message}</Text> : null}
        </View>
        <View style={{ marginTop: theme.spacing.xxxl }}>
          <RecentActivity commands={commandsQuery.data ?? []} error={commandsQuery.isError ? commandsQuery.error : undefined} loading={commandsQuery.isLoading} onViewAll={() => navigation.navigate('CommandHistory', { deviceId })} theme={theme} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function handleModeToggle(nextMode: 'on' | 'off', submit: (mode: 'on' | 'off') => Promise<void>): void {
  if (nextMode === 'on') { submit('on').catch(() => undefined); return; }
  Alert.alert('Switch to Standby?', 'Sensors will pause and relays will turn off.', [
    { style: 'cancel', text: 'Cancel' },
    { onPress: () => { submit('off').catch(() => undefined); }, text: 'Confirm' },
  ]);
}

function controlFeedback(controls: ReturnType<typeof useDeviceControls>): { message: string; state: 'failure' | 'queued' } | null {
  for (const control of [controls.mode, controls.fan, controls.lamp, controls.filter]) {
    if ((control.state === 'failure' || control.state === 'queued') && control.errorMessage !== null) return { message: control.errorMessage, state: control.state };
  }
  return null;
}

function useStableLiveTelemetryRequest() {
  return useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getTime() - 30 * 60 * 1000), to: now, limit: 720 };
  }, []);
}

function goBack(navigation: Props['navigation']): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  navigation.navigate('Tabs');
}

function getBlockingError({ device, deviceError, deviceFailed, shadow, shadowError, shadowFailed, telemetry, telemetryError, telemetryFailed }: {
  device: unknown; deviceError: unknown; deviceFailed: boolean; shadow: unknown; shadowError: unknown; shadowFailed: boolean; telemetry: unknown; telemetryError: unknown; telemetryFailed: boolean;
}): string | null {
  if (deviceFailed && device === undefined) return `Unable to load device details.${detailError(deviceError)}`;
  if (shadowFailed && shadow === undefined) return `Unable to load device status.${detailError(shadowError)}`;
  if (telemetryFailed && telemetry === undefined) return `Unable to load live telemetry.${detailError(telemetryError)}`;
  if (device === null) return 'Device not found.';
  return null;
}

function detailError(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? ` ${error.message}` : '';
}

function latest(points: TelemetryPoint[]): TelemetryPoint | null {
  return points.reduce<TelemetryPoint | null>((latestPoint, point) => latestPoint === null || point.ts > latestPoint.ts ? point : latestPoint, null);
}

function numberFromReported(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recentMetricValues(points: TelemetryPoint[], pick: (point: TelemetryPoint) => number | null): number[] {
  return points.map(pick).filter((value): value is number => value !== null).slice(-30);
}

/** Flutter's live provider keeps a rolling thirty-minute telemetry window. */
export function isLiveTelemetryPoint(point: TelemetryPoint, now = new Date()): boolean {
  return point.ts.getTime() >= now.getTime() - 30 * 60 * 1_000;
}

export function dashboardLayout(width: number, fontScale: number, horizontalPadding: number) {
  const contentWidth = Math.max(0, width - horizontalPadding * 2);
  const compactSensors = contentWidth < 360 || fontScale > 1.4;
  const relayColumns = fontScale > 1.7 || contentWidth < 360 ? 1 : 2;
  return { compactSensors, contentWidth, relayColumns };
}

function presenceText(online: boolean, lastSeen: Date | null): string {
  if (online) return '● Online';
  if (lastSeen === null) return '● Offline';
  const seconds = Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 1000));
  const relative = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
  return `● Offline · ${relative} ago`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  screen: { flex: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  relayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
