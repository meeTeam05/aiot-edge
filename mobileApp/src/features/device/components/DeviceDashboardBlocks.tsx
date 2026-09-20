import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBar, AppIcon, Card, StatusBadge } from '../../../components/ui';
import type { AtmosphereTheme } from '../../../design/theme';
import type { Command } from '../models/deviceModels';
import { SensorSparkline } from './Sparkline';

export function DashboardAppBar({ onBack, onSettings, theme, title }: { onBack: () => void; onSettings: () => void; theme: AtmosphereTheme; title: string }) {
  return <AppBar onBack={onBack} testID="device-dashboard-back" title={title} trailing={<Pressable accessibilityLabel="Device settings" accessibilityRole="button" hitSlop={10} onPress={onSettings} style={styles.appBarButton} testID="device-dashboard-settings"><AppIcon color={theme.colors.textPrimary} name="settings" /></Pressable>} />;
}

export function DeviceModeSummary({ disabled, loading, mode, online, onToggle, theme }: { disabled: boolean; loading: boolean; mode: string; online: boolean; onToggle: (nextMode: 'on' | 'off') => void; theme: AtmosphereTheme }) {
  const isOn = mode === 'on';
  return (
    <Card style={[styles.modeCard, { backgroundColor: isOn ? theme.colors.brandTint : theme.colors.background, padding: theme.spacing.xxl }]} testID="device-mode-card">
      <View>
        <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>DEVICE MODE</Text>
        <Text style={[theme.typography.h1, { color: isOn ? theme.colors.brand : theme.colors.textMuted, marginTop: theme.spacing.md }]}>{mode.toUpperCase()}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}>{online ? 'Online' : 'Offline'}</Text>
      </View>
      <Pressable accessibilityLabel="Device mode toggle" accessibilityRole="switch" accessibilityState={{ checked: isOn, disabled }} disabled={disabled} onPress={() => onToggle(isOn ? 'off' : 'on')} style={[styles.modeIndicator, disabled ? styles.dimmed : null, { backgroundColor: isOn ? theme.colors.brand : theme.colors.surfaceVariant, borderColor: theme.colors.border }]} testID="device-mode-toggle">
        {loading ? <ActivityIndicator color={isOn ? theme.colors.mint : theme.colors.textSecondary} /> : <View style={[styles.modeIndicatorDot, { backgroundColor: isOn ? theme.colors.mint : theme.colors.textSecondary }]} />}
      </Pressable>
    </Card>
  );
}

const tileBackgrounds = ['tileWarm', 'tileAir', 'tileCool', 'tileNo2'] as const;

export function SensorCard({ compact, index, label, sparkColor, sparkline, unit, value, dimmed, theme }: { compact: boolean; index: number; label: string; sparkColor: string; sparkline: number[]; unit: string; value: number | null; dimmed: boolean; theme: AtmosphereTheme }) {
  const displayValue = dimmed || value === null ? '—' : value.toFixed(2);
  return (
    <Card accessibilityLabel={`${label} sensor: ${displayValue === '—' ? 'Unavailable' : `${displayValue} ${unit}`}`} style={[styles.sensorCard, compact ? styles.compactSensorCard : null, { backgroundColor: theme.colors[tileBackgrounds[index] ?? 'tileCool'], borderRadius: theme.radius.tile, padding: theme.spacing.xl }]} testID={`sensor-${label.toLowerCase().replace('₂', '2')}`}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <View style={styles.sensorValueRow}>
        <Text style={[theme.typography.sensorValue, { color: dimmed ? theme.colors.textSecondary : theme.colors.textPrimary }]}>{displayValue}</Text>
        <Text style={[theme.typography.body, styles.unit, { color: theme.colors.textSecondary, marginLeft: theme.spacing.xs }]}>{unit}</Text>
      </View>
      <View style={styles.sparkline}>{!dimmed ? <SensorSparkline color={sparkColor} values={sparkline} /> : null}</View>
    </Card>
  );
}

/* eslint-disable react-native/no-inline-styles -- disabled opacity is derived from Flutter's read-only state */
export function RelayStatusCard({ channel, disabled, loading, name, on, onToggle, theme, width }: { channel: number; disabled: boolean; loading: boolean; name: string; on: boolean; onToggle: () => void; theme: AtmosphereTheme; width: number }) {
  return (
    <Card accessibilityLabel={`${name} relay: ${on ? 'On' : 'Off'}`} style={[styles.relayCard, { borderRadius: theme.radius.tile, opacity: disabled ? 0.55 : 1, padding: theme.spacing.xl, width }]} testID={`relay-${channel}`}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>CHANNEL {channel}</Text>
      <Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}>{name}</Text>
      <Pressable accessibilityLabel={`Relay ${channel} ${name} toggle`} accessibilityRole="switch" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onToggle} style={[styles.relayToggle, { backgroundColor: on ? theme.colors.brandTint : theme.colors.surfaceVariant, borderColor: theme.colors.border, borderRadius: theme.radius.pill, marginTop: theme.spacing.lg }]} testID={`relay-toggle-${channel}`}>
        {loading ? <ActivityIndicator color={theme.colors.brand} size="small" /> : <View style={[styles.relayToggleKnob, { backgroundColor: on ? theme.colors.brand : theme.colors.textSecondary }]} />}
      </Pressable>
      <View style={[styles.relayStatus, { backgroundColor: on ? theme.colors.brandTint : theme.colors.surfaceVariant, borderRadius: theme.radius.pill, marginTop: theme.spacing.lg }]}>
        <View style={[styles.relayStatusDot, { backgroundColor: on ? theme.colors.brand : theme.colors.textSecondary }]} />
        <Text style={[theme.typography.pill, { color: on ? theme.colors.brand : theme.colors.textSecondary, marginLeft: theme.spacing.xs }]}>{on ? 'ON' : 'OFF'}</Text>
      </View>
    </Card>
  );
}
/* eslint-enable react-native/no-inline-styles */

export function RecentActivity({ commands, error, loading, onViewAll, theme }: { commands: Command[]; error: unknown; loading: boolean; onViewAll: () => void; theme: AtmosphereTheme }) {
  return (
    <Card style={[styles.activityCard, { padding: theme.spacing.xl }]} testID="recent-activity">
      <View style={styles.activityHeader}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>Recent activity</Text><Pressable accessibilityLabel="View all commands" accessibilityRole="button" onPress={onViewAll} testID="device-view-all-commands"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>View all →</Text></Pressable></View>
      <View style={{ marginTop: theme.spacing.md }}>
        {loading ? <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Loading command activity...</Text> : null}
        {!loading && error !== undefined ? <Text style={[theme.typography.body, { color: theme.colors.danger }]}>Unable to load command activity.</Text> : null}
        {!loading && error === undefined && commands.length === 0 ? <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No command activity yet.</Text> : null}
        {!loading && error === undefined ? commands.slice(0, 3).map(command => <ActivityRow command={command} key={command.id} theme={theme} />) : null}
      </View>
    </Card>
  );
}

function ActivityRow({ command, theme }: { command: Command; theme: AtmosphereTheme }) {
  const type = typeof command.payload.type === 'string' ? command.payload.type : 'unknown';
  const label = type === 'device_mode'
    ? `Mode changed to ${String(command.payload.mode ?? '?').toUpperCase()}`
    : type === 'relay_set'
      ? `Relay ${String(command.payload.relay ?? '?')} turned ${command.payload.state === true ? 'on' : 'off'}`
      : type === 'calibrate_co'
        ? 'CO calibration requested'
        : type === 'calibrate_no2'
          ? 'NO2 calibration requested'
          : type;
  const status = command.status === 'done' ? 'Done' : command.status === 'sent' ? 'Sent' : command.status === 'error' ? 'Error' : command.status === 'timeout' ? 'Timeout' : 'Pending';
  return (
    <View style={[styles.activityRow, { borderTopColor: theme.colors.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: theme.colors.surfaceVariant }]}><AppIcon color={theme.colors.textSecondary} name="device" size={18} /></View>
      <View style={styles.activityContent}>
        <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[theme.typography.caption, styles.activityTime, { color: theme.colors.textSecondary }]}>{relativeTime(command.createdAt)}</Text>
      </View>
      <StatusBadge label={status} tone={status === 'Done' ? 'success' : status === 'Error' ? 'danger' : status === 'Timeout' ? 'warning' : 'accent'} />
    </View>
  );
}

export function DashboardBlockingState({ error, loading, onRetry, theme, title }: { error?: string; loading: boolean; onRetry: () => void; theme: AtmosphereTheme; title: string }) {
  return (
    <View style={[styles.blocking, { padding: theme.spacing.xxxl }]} testID={loading ? 'device-dashboard-loading' : 'device-dashboard-error'}>
      {loading ? <>
        <ActivityIndicator color={theme.colors.brand} size="large" />
        <Text style={[theme.typography.h2, styles.loadingTitle, { color: theme.colors.textPrimary }]}>Loading device dashboard…</Text>
      </> : <>
        <Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>Unable to load device dashboard.</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxl, opacity: pressed ? 0.8 : 1 }]} testID="device-dashboard-retry"><Text style={[theme.typography.body, { color: theme.colors.surface }]}>Retry</Text></Pressable>
      </>}
      <Text accessibilityElementsHidden style={[styles.hiddenTitle, { color: theme.colors.background }]}>{title}</Text>
    </View>
  );
}

function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const styles = StyleSheet.create({
  appBarButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  modeCard: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between' },
  modeIndicator: { alignItems: 'center', borderWidth: 1, borderRadius: 22, height: 44, justifyContent: 'center', width: 72 },
  dimmed: { opacity: 0.55 },
  modeIndicatorDot: { borderRadius: 12, height: 20, width: 20 },
  sensorCard: { borderWidth: 1, flex: 1, minHeight: 168 },
  compactSensorCard: { flexBasis: '100%', flexGrow: 0, minHeight: 176 },
  sensorValueRow: { alignItems: 'flex-end', flexDirection: 'row', marginTop: 16 },
  unit: { marginBottom: 3 },
  sparkline: { height: 32, justifyContent: 'flex-end', marginTop: 'auto', width: '100%' },
  relayCard: { borderWidth: 1, flex: 1, minHeight: 132 },
  relayToggle: { alignItems: 'center', borderWidth: 1, height: 32, justifyContent: 'center', width: 52 },
  relayToggleKnob: { borderRadius: 8, height: 16, width: 16 },
  relayStatus: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6 },
  relayStatusDot: { borderRadius: 4, height: 8, width: 8 },
  activityCard: { borderWidth: 1 },
  activityHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  activityRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingVertical: 12 },
  activityIcon: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  activityContent: { flex: 1, marginHorizontal: 10 },
  activityTime: { marginTop: 2 },
  blocking: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingTitle: { marginTop: 16 },
  retryButton: { alignItems: 'center', height: 48, justifyContent: 'center', minWidth: 120, paddingHorizontal: 20 },
  hiddenTitle: { height: 0, width: 0 },
});
