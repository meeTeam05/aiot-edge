import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Card, PrimaryButton, SecondaryButton } from '../../components/ui';
import { useAppTheme } from '../../design/ThemeProvider';
import { ReactNativeBleAdapter } from '../../services/ble/adapter';
import type { BleAdapter, BleScanDevice } from '../../services/ble/bleTypes';
import { SmartAirProvisioningConnectionService, type ProvisioningConnectionState } from '../../services/ble/provisioningConnection';
import { WifiProvisioningProtocol } from '../../services/ble/provisioningProtocol';
import { matchesSmartAirProvisioningName } from '../../services/ble/smartAirGatt';
import type { SmartAirGattConnection } from '../../services/ble/smartAirGatt';
import type { AppStackParamList } from '../../navigation/types';
import { cancelProvisioningSession, provisioningBleRegistry, useProvisioningSessionStore } from '../provisioning/session';
import { checkBlePreflight, preflightCopy, type BlePreflightStatus } from './bleScanState';

type NavigationProps = NativeStackScreenProps<AppStackParamList, 'ProvisionScan'>;
type Props = NavigationProps & {
  adapter?: BleAdapter;
  isLegacyLocationServiceEnabled?: () => Promise<boolean>;
  onConnected?: (connection: SmartAirGattConnection) => void;
  provisioningConnection?: SmartAirProvisioningConnectionService;
};

const SCAN_TIMEOUT_MS = 12_000;
const UI_TIMEOUT_MS = 15_000;

function sortAndMergeDevices(existing: BleScanDevice[], next: BleScanDevice): BleScanDevice[] {
  if (!matchesSmartAirProvisioningName(next.name) || existing.some((device) => device.id === next.id)) return existing;
  return [...existing, next].sort((left, right) => (right.rssi ?? -Infinity) - (left.rssi ?? -Infinity));
}

function usesLegacyLocationService(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 31;
}

function stopScanSafely(adapter: BleAdapter): void {
  adapter.stopScan().catch(() => undefined);
}

/** Flutter-equivalent Step 2 scan/preflight screen. Device connection begins in a later phase. */
export function BleScanScreen({ adapter: injectedAdapter, isLegacyLocationServiceEnabled, navigation, onConnected, provisioningConnection, route }: Props) {
  const { theme } = useAppTheme();
  const ownedAdapter = useMemo(() => (injectedAdapter === undefined ? new ReactNativeBleAdapter() : null), [injectedAdapter]);
  const adapter = injectedAdapter ?? ownedAdapter!;
  const ownedConnection = useMemo(() => (provisioningConnection === undefined ? new SmartAirProvisioningConnectionService(adapter) : null), [adapter, provisioningConnection]);
  const connection = provisioningConnection ?? ownedConnection!;
  const protocol = useMemo(() => new WifiProvisioningProtocol(adapter), [adapter]);
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const [devices, setDevices] = useState<BleScanDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<BlePreflightStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [connectionState, setConnectionState] = useState<ProvisioningConnectionState>(connection.currentState);

  const clearTimers = () => {
    if (scanTimeout.current !== null) clearTimeout(scanTimeout.current);
    if (uiTimeout.current !== null) clearTimeout(uiTimeout.current);
    scanTimeout.current = null;
    uiTimeout.current = null;
  };

  useEffect(() => () => {
    mounted.current = false;
    clearTimers();
    stopScanSafely(adapter);
    ownedAdapter?.destroy();
  }, [adapter, ownedAdapter]);

  useEffect(() => connection.subscribe(setConnectionState), [connection]);

  const startScan = async () => {
    useProvisioningSessionStore.getState().beginScan();
    clearTimers();
    await adapter.stopScan().catch(() => undefined);
    if (!mounted.current) return;
    setDevices([]);
    setError(null);
    setPreflightStatus(null);
    setScanning(false);

    try {
      const status = await checkBlePreflight({
        adapter,
        requiresLegacyLocationService: usesLegacyLocationService(),
        isLegacyLocationServiceEnabled,
      });
      if (!mounted.current) return;
      if (status !== 'ready') {
        setPreflightStatus(status);
        setError(preflightCopy(status).message);
        return;
      }

      setScanning(true);
      await adapter.startScan(
        (device) => {
          if (mounted.current) setDevices((current) => sortAndMergeDevices(current, device));
        },
        (scanError) => {
          if (!mounted.current) return;
          clearTimers();
          setScanning(false);
          setError(scanError.message);
        },
      );
      scanTimeout.current = setTimeout(() => {
        stopScanSafely(adapter);
        if (mounted.current) setScanning(false);
      }, SCAN_TIMEOUT_MS);
      uiTimeout.current = setTimeout(() => {
        if (mounted.current) setScanning(false);
      }, UI_TIMEOUT_MS);
    } catch (scanError) {
      if (!mounted.current) return;
      clearTimers();
      setScanning(false);
      setError(scanError instanceof Error ? scanError.message : 'Bluetooth scan failed');
    }
  };

  const openSettings = async () => {
    if (preflightStatus === 'permissionPermanentlyDenied') {
      await Linking.openSettings();
    } else if (Platform.OS === 'android' && preflightStatus === 'bluetoothOff') {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    } else if (Platform.OS === 'android' && preflightStatus === 'locationOff') {
      await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
    }
  };

  const handleStartScan = () => {
    startScan().catch(() => undefined);
  };

  const handleOpenSettings = () => {
    openSettings().catch(() => undefined);
  };

  const handleDeviceSelected = async (device: BleScanDevice) => {
    if (connectionState === 'connecting' || connectionState === 'connected' || connectionState === 'discovering') return;
    clearTimers();
    stopScanSafely(adapter);
    setScanning(false);
    setError(null);
    setPreflightStatus(null);
    useProvisioningSessionStore.getState().beginConnection();
    try {
      const activeConnection = await connection.connect(device.id);
      if (!mounted.current) return;
      provisioningBleRegistry.set(connection, protocol);
      useProvisioningSessionStore.getState().setConnected({ bleDeviceId: activeConnection.deviceId, homeId: route.params.homeId });
      onConnected?.(activeConnection);
      navigation.navigate('WifiProvision');
    } catch (connectionError) {
      if (!mounted.current) return;
      useProvisioningSessionStore.getState().setFailed();
      setError(connectionError instanceof Error ? connectionError.message : 'Bluetooth connection failed');
    }
  };

  const cancelProvisioning = () => {
    cancelProvisioningSession()
      .catch(() => undefined)
      .finally(() => undefined);
    navigation.goBack();
  };

  const isConnecting = connectionState === 'connecting' || connectionState === 'connected' || connectionState === 'discovering';

  const errorCopy = preflightStatus === null ? { title: 'Scan failed', message: error ?? '' } : preflightCopy(preflightStatus);
  const canOpenSettings = preflightStatus === 'bluetoothOff' || preflightStatus === 'permissionPermanentlyDenied' || preflightStatus === 'locationOff';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.xxl }]}>
        <Pressable accessibilityLabel="Cancel provisioning" accessibilityRole="button" hitSlop={10} onPress={cancelProvisioning} testID="provision-scan-cancel">
          <AppIcon color={theme.colors.textPrimary} name="close" size={24} />
        </Pressable>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Provisioning</Text>
        <View style={styles.closeSpacer} />
      </View>
      <View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}>
        <View style={[styles.dots, { marginTop: theme.spacing.lg }]}>{[0, 1, 2, 3, 4].map((step) => <View key={step} style={[styles.dot, { backgroundColor: step === 1 ? theme.colors.brand : theme.colors.border }]} />)}</View>
        <Text style={[styles.title, { color: theme.colors.textPrimary, marginTop: theme.spacing.xxxl }]}>Scan for nearby devices</Text>
        <Text style={[styles.subtitle, theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>We’ll find Smart Air units in provisioning mode and connect to the strongest one.</Text>
        <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xxxl }} style={styles.body}>
          <Card testID="provision-scan-card">
            {scanning ? (
              <View style={styles.state}><ActivityIndicator color={theme.colors.brand} size="large" /><Text style={[styles.scanningLabel, theme.typography.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>Scanning…</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Tap a device to continue.</Text></View>
            ) : error !== null ? (
              <View style={styles.state} testID="provision-scan-error"><AppIcon color={theme.colors.danger} name="warning" size={30} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>{errorCopy.title}</Text><Text style={[styles.centeredCopy, theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{errorCopy.message}</Text>{canOpenSettings ? <Pressable accessibilityRole="button" onPress={handleOpenSettings} style={{ marginTop: theme.spacing.xxl }} testID="provision-scan-open-settings"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>Open Settings</Text></Pressable> : null}</View>
            ) : devices.length === 0 ? (
              <View style={styles.state} testID="provision-scan-ready"><AppIcon color={theme.colors.textSecondary} name="bluetooth" size={30} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>Ready to scan</Text><Text style={[styles.centeredCopy, theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Keep the device in pairing mode, then scan.</Text></View>
            ) : devices.map((device) => <DeviceTile busy={isConnecting} device={device} key={device.id} onPress={handleDeviceSelected} />)}
          </Card>
        </ScrollView>
        {isConnecting ? <Text style={[styles.connectingLabel, theme.typography.caption, { color: theme.colors.textSecondary }]}>{connectionState === 'discovering' ? 'Checking Smart Air service…' : 'Connecting…'}</Text> : null}
        <PrimaryButton disabled={scanning || isConnecting} label={scanning ? 'Scanning...' : error !== null ? 'Check again' : 'Scan'} loading={false} onPress={handleStartScan} testID="provision-scan-primary" />
        <View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Back" onPress={cancelProvisioning} testID="provision-scan-back" /></View>
      </View>
    </SafeAreaView>
  );
}

function DeviceTile({ busy, device, onPress }: { busy: boolean; device: BleScanDevice; onPress: (device: BleScanDevice) => void }) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" disabled={busy} onPress={() => onPress(device)} style={[styles.device, busy ? styles.deviceBusy : null, { borderBottomColor: theme.colors.border }]} testID={`provision-scan-device-${device.id}`}><View style={[styles.deviceIcon, { backgroundColor: theme.colors.brandTint }]}><AppIcon color={theme.colors.brand} name="bluetooth" size={24} /></View><View style={styles.deviceText}><Text style={[styles.deviceName, theme.typography.body, { color: theme.colors.textPrimary }]}>{device.name}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{device.id}</Text></View><View><Text style={[styles.rssi, theme.typography.body, { color: theme.colors.brand }]}>{device.rssi ?? '—'}{device.rssi === null ? '' : ' dBm'}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>Tap to connect</Text></View></Pressable>;
}

export { SCAN_TIMEOUT_MS, UI_TIMEOUT_MS, sortAndMergeDevices };

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', height: 52, justifyContent: 'space-between' }, closeSpacer: { width: 24 }, content: { flex: 1 }, dots: { flexDirection: 'row', gap: 6 }, dot: { borderRadius: 4, height: 8, width: 8 }, title: { fontFamily: 'PlusJakartaSans', fontSize: 28, fontWeight: '700', letterSpacing: -0.6 }, subtitle: { lineHeight: 22 }, scanningLabel: { fontWeight: '600' }, connectingLabel: { marginBottom: 8, textAlign: 'center' }, body: { flex: 1 }, state: { alignItems: 'center', minHeight: 190, justifyContent: 'center' }, centeredCopy: { lineHeight: 19, textAlign: 'center' }, device: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 84, paddingVertical: 12 }, deviceBusy: { opacity: 0.55 }, deviceIcon: { alignItems: 'center', borderRadius: 18, height: 52, justifyContent: 'center', width: 52 }, deviceText: { flex: 1, marginHorizontal: 16 }, deviceName: { fontWeight: '700' }, rssi: { fontWeight: '700', textAlign: 'right' },
});
