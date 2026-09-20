import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppTheme } from '../../../design/ThemeProvider';
import { getTheme } from '../../../design/theme';
import type { AppStackParamList } from '../../../navigation/types';
import { useDeviceOtaQuery, useOtaRealtimeProgressQuery, useOtaRequestMutation } from './hooks/useDeviceOta';
import type { OtaRealtimeProgress } from './models/otaProgressModels';
import type { OtaVersion } from './models/otaModels';

type Props = NativeStackScreenProps<AppStackParamList, 'DeviceOta'>;

/** Flutter OtaScreen parity: a 202 acknowledgement is a request, never completion. */
export function OtaScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const [submittingVersion, setSubmittingVersion] = useState<string | null>(null);
  const catalogQuery = useDeviceOtaQuery(route.params.deviceId);
  const progressQuery = useOtaRealtimeProgressQuery(route.params.deviceId);
  const otaRequest = useOtaRequestMutation(route.params.deviceId);
  const catalog = catalogQuery.data;
  const currentVersion = catalog?.currentVersion ?? 'Unknown';
  const isOnline = catalog?.deviceOnline ?? false;
  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('DeviceSettings', { deviceId: route.params.deviceId });
  };
  const startUpdate = (version: string) => {
    setSubmittingVersion(version);
    otaRequest.mutateAsync(version)
      .then(() => Alert.alert('Firmware update requested', `OTA update requested for ${version}`))
      .catch(error => Alert.alert('Failed to request firmware update', errorMessage(error)))
      .finally(() => setSubmittingVersion(null));
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <OtaAppBar onBack={onBack} theme={theme} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xxl, paddingBottom: theme.spacing.huge }}>
        <FirmwareCard currentVersion={currentVersion} isOnline={isOnline} theme={theme} />
        {progressQuery.data !== null && progressQuery.data.state !== 'idle' ? <OtaProgressCard onRetry={progressQuery.data.requestedVersion === null ? undefined : () => startUpdate(progressQuery.data?.requestedVersion ?? '')} progress={progressQuery.data} theme={theme} /> : null}
        <Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginBottom: theme.spacing.lg, marginTop: theme.spacing.xxxl }]}>Available versions</Text>
        {catalogQuery.isLoading && catalog === undefined ? <OtaLoadingState theme={theme} /> : null}
        {catalogQuery.isError && catalog === undefined ? <OtaMessage action="Retry" body={errorMessage(catalogQuery.error)} onAction={() => { catalogQuery.refetch().catch(() => undefined); }} testID="ota-error" theme={theme} title="Failed to load OTA versions" /> : null}
        {!catalogQuery.isLoading && !catalogQuery.isError && (catalog?.versions.length ?? 0) === 0 ? <OtaMessage body="Drop firmware binaries into server/ota-files to make them available here." testID="ota-empty" theme={theme} title="No OTA versions found" /> : null}
        {catalog !== undefined && !catalogQuery.isError ? catalog.versions.map(version => <OtaVersionCard currentVersion={currentVersion} disabled={submittingVersion !== null} key={version.version} onUpdate={() => startUpdate(version.version)} submitting={submittingVersion === version.version} theme={theme} version={version} />) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function OtaProgressCard({ onRetry, progress, theme }: { onRetry?: () => void; progress: OtaRealtimeProgress; theme: ReturnType<typeof getTheme> }) {
  const copy = progress.state === 'requesting'
    ? { title: 'Requesting firmware update', body: 'Sending the update request to the device service.' }
    : progress.state === 'accepted'
      ? { title: 'Firmware update requested', body: 'Waiting for firmware progress from the device.' }
      : progress.state === 'downloading'
    ? { title: 'Downloading firmware', body: progress.progress === null ? 'Preparing the firmware update…' : `Downloading firmware: ${progress.progress}%` }
    : progress.state === 'waiting_reboot'
      ? { title: 'OTA update applied', body: 'Device is rebooting to finish the update.' }
      : progress.state === 'checking_device'
        ? { title: 'Checking firmware version', body: 'Waiting for the device to reconnect…' }
        : progress.state === 'completed'
          ? { title: 'Firmware update complete', body: 'The device reconnected with the requested firmware version.' }
          : progress.state === 'timeout'
            ? { title: 'Unable to verify firmware update', body: 'The device did not reconnect in time.' }
            : { title: 'OTA update failed', body: progress.errorMessage ?? 'Device reported an OTA failure.' };
  const color = progress.state === 'failed' || progress.state === 'timeout' ? theme.colors.danger : theme.colors.brand;

  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, marginTop: theme.spacing.lg, padding: theme.spacing.xl }]} testID={`ota-progress-${progress.state}`}><Text style={[theme.typography.body, { color }]}>{copy.title}</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{copy.body}</Text>{(progress.state === 'failed' || progress.state === 'timeout') && onRetry !== undefined ? <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.progressRetry, { borderColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.lg }]} testID="ota-progress-retry"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>Retry</Text></Pressable> : null}</View>;
}

function OtaAppBar({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.appBar, { borderBottomColor: theme.colors.border, paddingHorizontal: theme.spacing.xl }]}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.appBarButton} testID="ota-back"><Text style={[styles.backGlyph, { color: theme.colors.textPrimary }]}>‹</Text></Pressable><Text style={[styles.appBarTitle, { color: theme.colors.textPrimary }]}>Firmware update</Text><View style={styles.appBarButton} /></View>;
}

function FirmwareCard({ currentVersion, isOnline, theme }: { currentVersion: string; isOnline: boolean; theme: ReturnType<typeof getTheme> }) {
  const statusColor = isOnline ? theme.colors.mint : theme.colors.textSecondary;
  return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, padding: theme.spacing.xl }]} testID="ota-firmware-card"><View style={styles.cardHeader}><Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Current firmware</Text><View style={[styles.statusPill, { backgroundColor: isOnline ? theme.colors.brandTint : theme.colors.surfaceVariant, borderRadius: theme.radius.pill }]}><Text style={[theme.typography.pill, { color: statusColor }]}>{isOnline ? 'Online' : 'Offline'}</Text></View></View><Text style={[styles.mono, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>{currentVersion}</Text></View>;
}

function OtaLoadingState({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <View style={styles.loading} testID="ota-loading"><Text style={[styles.loadingGlyph, { color: theme.colors.brand }]}>◌</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Loading available versions…</Text></View>;
}

function OtaMessage({ action, body, onAction, testID, theme, title }: { action?: string; body: string; onAction?: () => void; testID: string; theme: ReturnType<typeof getTheme>; title: string }) {
  return <View style={[styles.message, { paddingVertical: theme.spacing.huge }]} testID={testID}><Text style={[styles.messageGlyph, { color: theme.colors.textSecondary }]}>↓</Text><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.xl }]}>{title}</Text><Text style={[theme.typography.body, styles.messageBody, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{body}</Text>{action !== undefined && onAction !== undefined ? <Pressable accessibilityRole="button" onPress={onAction} style={[styles.retry, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxl }]} testID="ota-retry"><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{action}</Text></Pressable> : null}</View>;
}

function OtaVersionCard({ currentVersion, disabled, onUpdate, submitting, theme, version }: { currentVersion: string; disabled: boolean; onUpdate: () => void; submitting: boolean; theme: ReturnType<typeof getTheme>; version: OtaVersion }) {
  return <View style={[styles.card, styles.versionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, padding: theme.spacing.xl }]} testID={`ota-version-${version.version}`}><View style={styles.versionCopy}><View style={styles.versionTitle}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{version.version}</Text>{version.version === currentVersion ? <View style={[styles.currentPill, { backgroundColor: theme.colors.brandTint, borderRadius: theme.radius.pill }]} testID={`ota-current-${version.version}`}><Text style={[theme.typography.pill, { color: theme.colors.brand }]}>Current</Text></View> : null}</View><Text selectable style={[styles.mono, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{version.filename}</Text></View><Pressable accessibilityLabel={`Update to ${version.version}`} accessibilityRole="button" disabled={disabled} onPress={onUpdate} style={[styles.updateButton, disabled ? styles.disabled : undefined, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button }]} testID={`ota-update-${version.version}`}><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{submitting ? 'Requesting…' : 'Update'}</Text></Pressable></View>;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 56 },
  appBarButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backGlyph: { fontSize: 36, fontWeight: '300', lineHeight: 38 },
  appBarTitle: { flex: 1, fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: '600', marginHorizontal: 4 },
  card: { borderWidth: 1 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5 },
  mono: { fontFamily: 'JetBrainsMono', fontSize: 13 },
  loading: { alignItems: 'center', paddingVertical: 48 },
  loadingGlyph: { fontSize: 32 },
  message: { alignItems: 'center' },
  messageGlyph: { fontSize: 40 },
  messageBody: { maxWidth: 320, textAlign: 'center' },
  retry: { alignItems: 'center', height: 48, justifyContent: 'center', minWidth: 112, paddingHorizontal: 18 },
  progressRetry: { alignItems: 'center', borderWidth: 1, height: 44, justifyContent: 'center', minWidth: 112, paddingHorizontal: 18 },
  versionCard: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
  versionCopy: { flex: 1 },
  versionTitle: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  currentPill: { paddingHorizontal: 8, paddingVertical: 4 },
  updateButton: { alignItems: 'center', height: 40, justifyContent: 'center', marginLeft: 12, minWidth: 84, paddingHorizontal: 12 },
  disabled: { opacity: 0.55 },
});
