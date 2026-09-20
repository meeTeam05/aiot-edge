import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Card, PrimaryButton, SecondaryButton } from '../../components/ui';
import { useAppTheme } from '../../design/ThemeProvider';
import type { SmartAirGattConnection } from '../../services/ble/smartAirGatt';
import type { WifiProvisioningProtocol, WifiProvisioningResult, WifiProvisioningState } from '../../services/ble/provisioningProtocol';
import { provisioningBleRegistry, useProvisioningSessionStore } from '../provisioning/session';
import type { LocalDeviceService } from '../provisioning/localDevice';
import type { LocalDeviceConfigService } from '../provisioning/localDevice';
import type { ProvisioningRegistrationService } from '../provisioning/registration';
import type { CloudAnnounceService } from '../provisioning/announce';

type Protocol = Pick<WifiProvisioningProtocol, 'currentState' | 'provision' | 'subscribe'>;

export function WifiProvisionScreen({ announceService, connection, configService, localDeviceService, registrationService, onBack, onCancel, onContinue, protocol }: {
  announceService?: Pick<CloudAnnounceService, 'cancel' | 'retry' | 'start'>;
  connection?: SmartAirGattConnection;
  configService?: Pick<LocalDeviceConfigService, 'configureActiveSessionDevice'>;
  localDeviceService?: Pick<LocalDeviceService, 'waitForActiveSessionDevice'>;
  registrationService?: Pick<ProvisioningRegistrationService, 'registerActiveSessionDevice'>;
  onBack?: () => void;
  onCancel?: () => void;
  onContinue?: (result: WifiProvisioningResult) => void;
  protocol?: Protocol;
}) {
  const activeConnection = connection ?? provisioningBleRegistry.connection;
  const activeProtocol = protocol ?? provisioningBleRegistry.wifiProtocol;
  if (activeConnection === null || activeProtocol === null) {
    return <UnavailableWifiProvisionScreen onBack={onBack} />;
  }
  return <WifiProvisionContent announceService={announceService} connection={activeConnection} configService={configService} localDeviceService={localDeviceService} registrationService={registrationService} onBack={onBack} onCancel={onCancel} onContinue={onContinue} protocol={activeProtocol} />;
}

function WifiProvisionContent({ announceService, connection, configService, localDeviceService, registrationService, onBack, onCancel, onContinue, protocol }: {
  announceService?: Pick<CloudAnnounceService, 'cancel' | 'retry' | 'start'>;
  connection: SmartAirGattConnection;
  configService?: Pick<LocalDeviceConfigService, 'configureActiveSessionDevice'>;
  localDeviceService?: Pick<LocalDeviceService, 'waitForActiveSessionDevice'>;
  registrationService?: Pick<ProvisioningRegistrationService, 'registerActiveSessionDevice'>;
  onBack?: () => void;
  onCancel?: () => void;
  onContinue?: (result: WifiProvisioningResult) => void;
  protocol: Protocol;
}) {
  const { theme } = useAppTheme();
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [obscurePassword, setObscurePassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WifiProvisioningResult | null>(null);
  const [pendingWifiResult, setPendingWifiResult] = useState<WifiProvisioningResult | null>(null);
  const [state, setState] = useState<WifiProvisioningState>(protocol.currentState);
  const [checkingLocalDevice, setCheckingLocalDevice] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [configuringDevice, setConfiguringDevice] = useState(false);
  const [waitingCloudAnnounce, setWaitingCloudAnnounce] = useState(false);
  const [announceRetryAvailable, setAnnounceRetryAvailable] = useState(false);

  useEffect(() => protocol.subscribe(setState), [protocol]);

  const isSubmitting = checkingLocalDevice || registeringDevice || configuringDevice || waitingCloudAnnounce || state === 'sending_ssid' || state === 'sending_password' || state === 'waiting_result';
  const submit = async () => {
    let reachedCloudAnnounce = false;
    if (isSubmitting) return;
    if (ssid.trim().length === 0) {
      setError('Enter your Wi‑Fi SSID');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError(null);
    setResult(null);
    setPendingWifiResult(null);
    setAnnounceRetryAvailable(false);
    useProvisioningSessionStore.getState().setStatus('wifi_provisioning');
    try {
      const wifiResult = await protocol.provision(connection, ssid.trim(), password);
      useProvisioningSessionStore.getState().setWifiResult(wifiResult);
      setPendingWifiResult(wifiResult);
      if (localDeviceService !== undefined) {
        setCheckingLocalDevice(true);
        await localDeviceService.waitForActiveSessionDevice();
        setCheckingLocalDevice(false);
      }
      if (registrationService !== undefined) {
        setRegisteringDevice(true);
        await registrationService.registerActiveSessionDevice();
        setRegisteringDevice(false);
      }
      if (configService !== undefined) {
        setConfiguringDevice(true);
        await configService.configureActiveSessionDevice();
        setConfiguringDevice(false);
      }
      if (announceService !== undefined) {
        reachedCloudAnnounce = true;
        setWaitingCloudAnnounce(true);
        await announceService.start();
        setWaitingCloudAnnounce(false);
        // Flutter advances from a confirmed cloud announce directly into naming.
        onContinue?.(wifiResult);
        return;
      }
      setResult(wifiResult);
    } catch (provisionError) {
      setCheckingLocalDevice(false);
      setRegisteringDevice(false);
      setConfiguringDevice(false);
      setWaitingCloudAnnounce(false);
      setAnnounceRetryAvailable(reachedCloudAnnounce);
      useProvisioningSessionStore.getState().setFailed();
      setError(provisionError instanceof Error ? provisionError.message : 'Provisioning failed');
    }
  };

  const retryCloudAnnounce = async () => {
    if (announceService === undefined || isSubmitting) return;
    setError(null);
    setWaitingCloudAnnounce(true);
    try {
      await announceService.retry();
      setAnnounceRetryAvailable(false);
      if (pendingWifiResult !== null) setResult(pendingWifiResult);
    } catch (announceError) {
      useProvisioningSessionStore.getState().setFailed();
      setError(announceError instanceof Error ? announceError.message : 'Cloud confirmation failed');
    } finally {
      setWaitingCloudAnnounce(false);
    }
  };
  const cancel = () => {
    announceService?.cancel();
    onCancel?.();
  };
  const stateLabel = waitingCloudAnnounce ? 'Confirming cloud connection…' : configuringDevice ? 'Configuring device…' : registeringDevice ? 'Registering device…' : checkingLocalDevice ? 'Checking device…' : state === 'sending_ssid' ? 'Sending Wi-Fi network…' : state === 'sending_password' ? 'Sending password…' : 'Waiting for device…';
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
    <View style={[styles.header, { paddingHorizontal: theme.spacing.xxl }]}><Pressable accessibilityLabel="Close Wi-Fi provisioning" accessibilityRole="button" onPress={onCancel === undefined ? onBack : cancel} testID="wifi-provision-close"><AppIcon color={theme.colors.textPrimary} name="close" size={24} /></Pressable><Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Provisioning</Text><View style={styles.closeSpacer} /></View>
    <View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Connect to Wi‑Fi</Text>
      <Text style={[theme.typography.body, styles.subtitle, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Send Wi-Fi details securely over the active Bluetooth connection.</Text>
      <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xxxl }} style={styles.body}>
        <Card>{result !== null ? <View style={styles.state} testID="wifi-provision-success"><AppIcon color={theme.colors.brand} name="check" size={32} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>Wi-Fi connected</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Device {result.deviceId} is available at {result.ip}.</Text></View> : <View>{error !== null ? <View style={styles.error} testID="wifi-provision-error"><AppIcon color={theme.colors.danger} name="warning" size={20} /><Text style={[theme.typography.caption, { color: theme.colors.danger, marginLeft: theme.spacing.md }]}>{error}</Text></View> : null}<Field label="Wi‑Fi network" onChangeText={setSsid} testID="wifi-provision-ssid" value={ssid} /><Field label="Password" onChangeText={setPassword} secureTextEntry={obscurePassword} testID="wifi-provision-password" value={password} /><Pressable accessibilityRole="button" onPress={() => setObscurePassword((current) => !current)} style={{ marginTop: theme.spacing.md }}><Text style={[theme.typography.caption, { color: theme.colors.brand }]}>{obscurePassword ? 'Show password' : 'Hide password'}</Text></Pressable></View>}</Card>
      </ScrollView>
      {isSubmitting ? <Text style={[styles.progress, theme.typography.caption, { color: theme.colors.textSecondary }]}>{stateLabel}</Text> : null}
      <PrimaryButton disabled={isSubmitting} label={result !== null ? 'Continue' : isSubmitting ? 'Sending…' : announceRetryAvailable ? 'Retry' : 'Send credentials'} loading={isSubmitting} onPress={result !== null ? () => onContinue?.(result) : announceRetryAvailable ? () => { retryCloudAnnounce().catch(() => undefined); } : () => { submit().catch(() => undefined); }} testID="wifi-provision-primary" />
      <View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Back" onPress={onBack} testID="wifi-provision-back" /></View>
    </View>
  </SafeAreaView>;
}

function UnavailableWifiProvisionScreen({ onBack }: { onBack?: () => void }) {
  const { theme } = useAppTheme();
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}><Text style={[styles.title, { color: theme.colors.textPrimary }]}>Connect to Wi‑Fi</Text><Card><View style={styles.state} testID="wifi-provision-session-unavailable"><AppIcon color={theme.colors.danger} name="warning" size={32} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>Connection unavailable</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Return to device scan and connect again.</Text></View></Card><View style={styles.bottomAction}><SecondaryButton label="Back" onPress={onBack} testID="wifi-provision-back" /></View></View></SafeAreaView>;
}

function Field({ label, ...props }: { label: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; testID: string; value: string }) {
  const { theme } = useAppTheme();
  return <View style={{ marginBottom: theme.spacing.xl }}><Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>{label}</Text><TextInput {...props} autoCapitalize="none" placeholder={label} placeholderTextColor={theme.colors.textSecondary} style={[styles.field, { borderColor: theme.colors.border, borderRadius: theme.radius.input, color: theme.colors.textPrimary }]} /></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', height: 52, justifyContent: 'space-between' }, closeSpacer: { width: 24 }, content: { flex: 1 }, title: { fontFamily: 'PlusJakartaSans', fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 24 }, subtitle: { lineHeight: 22 }, body: { flex: 1 }, field: { borderWidth: 1, minHeight: 52, paddingHorizontal: 16 }, state: { alignItems: 'center', minHeight: 220, justifyContent: 'center' }, error: { alignItems: 'center', flexDirection: 'row', marginBottom: 16 }, centered: { lineHeight: 19, textAlign: 'center' }, progress: { marginBottom: 8, textAlign: 'center' }, bottomAction: { marginTop: 'auto' } });
