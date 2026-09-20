import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '../../components/BrandMark';
import { useAppTheme } from '../../design/ThemeProvider';
import { getTheme } from '../../design/theme';
import { useNotificationsQuery } from './hooks/useNotificationsQuery';
import type { NotificationItem } from './models/notificationModels';

interface NotificationsScreenProps {
  onOpenDevice?: (deviceId: string) => void;
  onOpenDevices?: () => void;
}

/** Flutter-equivalent REST-backed Notifications tab. Realtime cache updates are intentionally deferred. */
export function NotificationsScreen({ onOpenDevice, onOpenDevices }: NotificationsScreenProps) {
  const { theme } = useAppTheme();
  const notificationsQuery = useNotificationsQuery();
  const { colors, spacing } = theme;
  const header = <NotificationsHeader theme={theme} />;

  if (notificationsQuery.isLoading) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>{header}<NotificationsLoadingState theme={theme} /></SafeAreaView>;
  }

  if (notificationsQuery.isError) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>{header}<NotificationsEmptyState actionLabel="Retry" body={errorMessage(notificationsQuery.error)} icon="!" onAction={() => { notificationsQuery.refetch().catch(() => undefined); }} testID="notifications-error-state" theme={theme} title="Failed to load notifications" /></SafeAreaView>;
  }

  const items = notificationsQuery.data ?? [];
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <FlatList
        contentContainerStyle={items.length === 0 ? styles.emptyList : { paddingBottom: spacing.xxxl }}
        data={items}
        keyExtractor={item => item.id}
        ListEmptyComponent={<NotificationsEmptyState actionLabel="Open devices" body="Important device events will appear here when devices go offline, finish commands, or complete OTA updates." icon="◌" onAction={() => onOpenDevices?.()} testID="notifications-empty-state" theme={theme} title="No notifications yet" />}
        ListHeaderComponent={header}
        renderItem={({ item }) => <View style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.xl }}><NotificationCard item={item} onPress={onOpenDevice} theme={theme} /></View>}
        testID="notifications-list"
      />
    </SafeAreaView>
  );
}

function NotificationsHeader({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <><View style={[styles.appBar, { backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.xl }]}><BrandMark size={24} /><Text style={[styles.wordmark, { color: theme.colors.textPrimary }]}>Atmosphere</Text></View><View style={{ paddingBottom: theme.spacing.lg, paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xxl }}><Text style={[theme.typography.pageTitle, { color: theme.colors.textPrimary }]}>Notifications</Text></View></>;
}

function NotificationsLoadingState({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <View style={{ paddingHorizontal: theme.spacing.xl }} testID="notifications-loading-state">{[0, 1, 2, 3].map(index => <View key={index} style={[styles.skeleton, index === 3 ? undefined : styles.skeletonSpacing, { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.card }]} />)}</View>;
}

function NotificationsEmptyState({ actionLabel, body, icon, onAction, testID, theme, title }: { actionLabel: string; body: string; icon: string; onAction: () => void; testID: string; theme: ReturnType<typeof getTheme>; title: string }) {
  return <View style={[styles.emptyState, { padding: theme.spacing.huge }]} testID={testID}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceVariant }]}><Text style={[styles.emptyGlyph, { color: theme.colors.textSecondary }]}>{icon}</Text></View><Text style={[theme.typography.h1, styles.emptyTitle, { color: theme.colors.textPrimary, marginTop: theme.spacing.xxxl }]}>{title}</Text><Text style={[theme.typography.body, styles.emptyBody, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>{body}</Text><Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.emptyAction, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.huge, opacity: pressed ? 0.8 : 1 }]}><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{actionLabel}</Text></Pressable></View>;
}

function NotificationCard({ item, onPress, theme }: { item: NotificationItem; onPress?: (deviceId: string) => void; theme: ReturnType<typeof getTheme> }) {
  const appearance = notificationAppearance(item, theme);
  return <Pressable accessibilityLabel={`Open notification for ${item.deviceName}`} accessibilityRole="button" accessibilityState={{ disabled: onPress === undefined }} disabled={onPress === undefined} onPress={() => onPress?.(item.deviceId)} style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, opacity: pressed && onPress ? 0.8 : onPress ? 1 : 0.6, padding: theme.spacing.xl }]}><View style={[styles.iconTile, { backgroundColor: appearance.background }]}><Text style={[styles.tileGlyph, { color: appearance.color }]}>{appearance.icon}</Text></View><View style={[styles.cardCopy, { marginLeft: theme.spacing.lg }]}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{item.title}</Text><Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>{item.body}</Text><View style={[styles.metaRow, { marginTop: theme.spacing.md }]}><Text numberOfLines={1} style={[theme.typography.caption, styles.deviceName, { color: theme.colors.textPrimary }]}>{item.deviceName}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginLeft: theme.spacing.lg }]}>{formatNotificationTimestamp(item.occurredAt)}</Text></View></View></Pressable>;
}

function notificationAppearance(item: NotificationItem, theme: ReturnType<typeof getTheme>) {
  const icon = item.type === 'device.online' || item.type === 'command.done' || item.type === 'ota.rebooting'
    ? '✓'
    : item.type === 'device.offline' || item.type === 'command.timeout'
      ? '!'
      : item.type === 'ota.failed' || item.type === 'command.error'
        ? '×'
        : '◌';
  switch (item.severity) {
    case 'success': return { icon, background: theme.colors.brandTint, color: theme.colors.mint };
    case 'warning': return { icon, background: theme.colors.warnTint, color: theme.colors.warn };
    case 'danger': return { icon, background: theme.colors.dangerTint, color: theme.colors.danger };
    default: return { icon, background: theme.colors.surfaceVariant, color: theme.colors.textMuted };
  }
}

export function formatNotificationTimestamp(value: Date): string {
  const hour = value.getHours().toString().padStart(2, '0');
  const minute = value.getMinutes().toString().padStart(2, '0');
  return `${value.getDate()}/${value.getMonth() + 1} ${hour}:${minute}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  emptyList: { flexGrow: 1 },
  appBar: { alignItems: 'center', flexDirection: 'row', height: 56 },
  wordmark: { fontFamily: 'PlusJakartaSans', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  skeleton: { height: 108 },
  skeletonSpacing: { marginBottom: 12 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyIcon: { alignItems: 'center', borderRadius: 60, height: 120, justifyContent: 'center', width: 120 },
  emptyGlyph: { fontSize: 48 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { maxWidth: 320, textAlign: 'center' },
  emptyAction: { alignItems: 'center', height: 52, justifyContent: 'center', minWidth: 160, paddingHorizontal: 24 },
  card: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row' },
  cardCopy: { flex: 1 },
  iconTile: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  tileGlyph: { fontSize: 20 },
  metaRow: { alignItems: 'center', flexDirection: 'row' },
  deviceName: { flex: 1 },
});
