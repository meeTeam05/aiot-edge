import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AtmosphereTheme } from '../../../design/theme';
import { useRoomsQuery } from '../hooks/useHomeQueries';
import type { Device } from '../models/homeModels';

interface DeviceSummaryCardProps {
  device: Device;
  onPress?: (deviceId: string) => void;
  theme: AtmosphereTheme;
}

export function DeviceSummaryCard({ device, onPress, theme }: DeviceSummaryCardProps) {
  const roomsQuery = useRoomsQuery(device.homeId);
  const roomName = device.roomId === null ? null : roomsQuery.data?.find(room => room.id === device.roomId)?.name;
  const tint = getTint(device.id, theme);
  const { colors, radius, spacing, typography } = theme;

  return (
    <View style={[styles.card, { backgroundColor: tint.background, borderColor: colors.border, borderRadius: radius.card, padding: spacing.xxl }]}>
      <View style={styles.headerRow}>
        <View style={[styles.deviceIcon, { backgroundColor: tint.accent }]}><Text accessibilityLabel="Device" style={[styles.deviceGlyph, { color: colors.textPrimary }]}>◌</Text></View>
        <Text numberOfLines={1} style={[typography.h2, styles.name, { color: colors.textPrimary, marginLeft: spacing.lg }]}>{device.name}</Text>
        {device.mode !== null ? <StatusPill label={device.mode.toUpperCase()} online={device.mode === 'on'} theme={theme} /> : null}
        <View style={{ marginLeft: spacing.md }}><StatusPill label={device.online ? 'Online' : 'Offline'} online={device.online} theme={theme} /></View>
      </View>
      <RoomSection roomId={device.roomId} roomName={roomName ?? undefined} theme={theme} />
      <Pressable accessibilityLabel={`View details for ${device.name}`} accessibilityRole="button" accessibilityState={{ disabled: onPress === undefined }} disabled={onPress === undefined} onPress={() => onPress?.(device.id)} style={({ pressed }) => [styles.detailButton, { backgroundColor: colors.surface, borderColor: colors.brand, borderRadius: radius.button, marginTop: spacing.xxl, opacity: pressed && onPress ? 0.8 : onPress ? 1 : 0.55 }]}>
        <Text style={[typography.body, { color: colors.brand }]}>View Detail</Text>
      </Pressable>
    </View>
  );
}

export function RoomSection({ roomId, roomName, theme }: { roomId: string | null; roomName?: string; theme: AtmosphereTheme }) {
  const label = roomName ?? (roomId === null ? 'No room assigned' : 'Room unavailable');
  return (
    <View style={[styles.roomRow, { marginTop: theme.spacing.xl }]}>
      <Text accessibilityLabel="Room" style={[styles.pin, { color: theme.colors.textSecondary }]}>⌖</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginLeft: theme.spacing.sm }]}>{label}</Text>
    </View>
  );
}

function StatusPill({ label, online, theme }: { label: string; online: boolean; theme: AtmosphereTheme }) {
  const color = online ? '#1A8767' : theme.colors.textSecondary;
  const backgroundColor = online ? 'rgba(26, 135, 103, 0.15)' : 'rgba(110, 130, 125, 0.15)';
  return <View style={[styles.pill, { backgroundColor, borderRadius: theme.radius.pill }]}><Text numberOfLines={1} style={[theme.typography.pill, { color }]}>{label}</Text></View>;
}

function getTint(id: string, theme: AtmosphereTheme): { background: string; accent: string } {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 2_147_483_647;
  switch (Math.abs(hash) % 4) {
    case 0: return { background: theme.colors.brandTint, accent: theme.colors.brand };
    case 1: return { background: theme.colors.accentTint, accent: theme.colors.accent };
    case 2: return { background: theme.colors.tileCool, accent: theme.colors.brand };
    default: return { background: theme.colors.tileNo2, accent: '#7A4FD0' };
  }
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  headerRow: { alignItems: 'center', flexDirection: 'row' },
  deviceIcon: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  deviceGlyph: { fontSize: 24 },
  name: { flex: 1, minWidth: 0 },
  roomRow: { alignItems: 'center', flexDirection: 'row' },
  pin: { fontSize: 14 },
  pill: { maxWidth: 82, paddingHorizontal: 10, paddingVertical: 4 },
  detailButton: { alignItems: 'center', borderWidth: 1.5, height: 52, justifyContent: 'center' },
});
