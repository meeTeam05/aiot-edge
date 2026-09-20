import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppTheme } from '../../../design/ThemeProvider';
import { getTheme } from '../../../design/theme';
import type { AppStackParamList } from '../../../navigation/types';
import { useCommandHistoryQuery } from './hooks/useCommandHistory';
import { commandHistoryFilters, commandStatusPresentation, filterCommandHistory, type CommandHistoryFilter } from './models/commandHistoryModels';
import { formatCommandPayload, formatCommandTimestamp } from './presentation/commandHistoryPresentation';
import type { Command } from '../models/deviceModels';

type Props = NativeStackScreenProps<AppStackParamList, 'CommandHistory'>;

/** Flutter-equivalent first-page command history; realtime patches its query cache. */
export function CommandHistoryScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const [filter, setFilter] = useState<CommandHistoryFilter>('all');
  const [selected, setSelected] = useState<Command | null>(null);
  const query = useCommandHistoryQuery(route.params.deviceId);
  const commands = useMemo(() => filterCommandHistory(query.commands, filter), [filter, query.commands]);
  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('DeviceDetail', { deviceId: route.params.deviceId });
  };
  const header = <><HistoryAppBar onBack={onBack} theme={theme} /><FilterBar active={filter} onSelect={setFilter} theme={theme} /></>;

  if (query.isLoading) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>{header}<HistoryLoadingState theme={theme} /></SafeAreaView>;
  }
  if (query.isError) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>{header}<HistoryMessage action="Retry" body={errorMessage(query.error)} onAction={() => { query.refresh().catch(() => undefined); }} testID="command-history-error" theme={theme} title="Unable to load command history" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <FlatList
        contentContainerStyle={commands.length === 0 ? styles.emptyList : { paddingBottom: theme.spacing.xxxl }}
        data={commands}
        keyExtractor={command => command.id}
        ListEmptyComponent={<HistoryMessage body="Command history will appear here once you interact with the device." testID="command-history-empty" theme={theme} title="No commands yet" />}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl onRefresh={() => { query.refresh().catch(() => undefined); }} refreshing={query.isRefetching} tintColor={theme.colors.brand} />}
        renderItem={({ item }) => <CommandRow command={item} onPress={() => setSelected(item)} theme={theme} />}
        testID="command-history-list"
      />
      <PayloadSheet command={selected} onDismiss={() => setSelected(null)} theme={theme} />
    </SafeAreaView>
  );
}

function HistoryAppBar({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.appBar, { borderBottomColor: theme.colors.border, paddingHorizontal: theme.spacing.xl }]}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.backButton} testID="command-history-back"><Text style={[styles.backGlyph, { color: theme.colors.textPrimary }]}>‹</Text></Pressable><Text style={[styles.appBarTitle, { color: theme.colors.textPrimary }]}>Command history</Text><View style={styles.backButton} /></View>;
}

function FilterBar({ active, onSelect, theme }: { active: CommandHistoryFilter; onSelect: (filter: CommandHistoryFilter) => void; theme: ReturnType<typeof getTheme> }) {
  return <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.xl }} horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: theme.spacing.lg }}><View style={styles.filters}>{commandHistoryFilters.map(filter => <Pressable accessibilityRole="button" key={filter} onPress={() => onSelect(filter)} style={[styles.filterChip, { backgroundColor: active === filter ? theme.colors.brandTint : theme.colors.surface, borderColor: active === filter ? theme.colors.brand : theme.colors.border, borderRadius: theme.radius.pill }]} testID={`command-filter-${filter}`}><Text style={[theme.typography.pill, { color: active === filter ? theme.colors.brand : theme.colors.textSecondary }]}>{filter === 'all' ? 'All' : filter === 'done' ? 'Done' : filter === 'failed' ? 'Failed' : 'Pending'}</Text></Pressable>)}</View></ScrollView>;
}

function HistoryLoadingState({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <View style={{ paddingHorizontal: theme.spacing.xl }} testID="command-history-loading">{[0, 1, 2].map(index => <View key={index} style={[styles.skeleton, index < 2 ? { marginBottom: theme.spacing.md } : undefined, { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.card }]} />)}</View>;
}

function HistoryMessage({ action, body, onAction, testID, theme, title }: { action?: string; body: string; onAction?: () => void; testID: string; theme: ReturnType<typeof getTheme>; title: string }) {
  return <View style={[styles.message, { padding: theme.spacing.huge }]} testID={testID}><Text style={[styles.messageGlyph, { color: theme.colors.textSecondary }]}>◌</Text><Text style={[theme.typography.h1, { color: theme.colors.textPrimary, marginTop: theme.spacing.xxl }]}>{title}</Text><Text style={[theme.typography.body, styles.messageBody, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{body}</Text>{action !== undefined && onAction !== undefined ? <Pressable accessibilityRole="button" onPress={onAction} style={[styles.retry, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxl }]} testID="command-history-retry"><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{action}</Text></Pressable> : null}</View>;
}

function CommandRow({ command, onPress, theme }: { command: Command; onPress: () => void; theme: ReturnType<typeof getTheme> }) {
  const status = commandStatusPresentation(command.status);
  const color = status.tone === 'danger' ? theme.colors.danger : status.tone === 'warn' ? theme.colors.warn : status.tone === 'online' ? theme.colors.brand : status.tone === 'brand' ? theme.colors.accent : theme.colors.accent;
  return <Pressable accessibilityLabel={`Open command ${command.id}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.commandRow, { borderTopColor: theme.colors.border, opacity: pressed ? 0.8 : 1, paddingHorizontal: theme.spacing.xl }]} testID={`command-row-${command.id}`}><View style={[styles.iconTile, { backgroundColor: theme.colors.surfaceVariant }]}><Text style={[styles.iconGlyph, { color: theme.colors.textSecondary }]}>{commandIcon(command)}</Text></View><View style={[styles.commandCopy, { marginLeft: theme.spacing.lg }]}><Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{commandLabel(command)}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{formatCommandTimestamp(command.createdAt)}</Text></View><View style={[styles.statusPill, { backgroundColor: `${color}22`, borderRadius: theme.radius.pill }]}><Text style={[theme.typography.pill, { color }]}>{status.label}</Text></View></Pressable>;
}

function PayloadSheet({ command, onDismiss, theme }: { command: Command | null; onDismiss: () => void; theme: ReturnType<typeof getTheme> }) {
  return <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={command !== null}><Pressable accessibilityRole="button" onPress={onDismiss} style={styles.modalBackdrop}><Pressable accessibilityRole="none" onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.card, borderTopRightRadius: theme.radius.card, padding: theme.spacing.xxxl }]} testID="command-payload-sheet"><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>Command payload</Text><Text selectable style={[styles.payload, { backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.input, color: theme.colors.textSecondary, marginTop: theme.spacing.xl, padding: theme.spacing.lg }]}>{command === null ? '' : formatCommandPayload(command.payload)}</Text></Pressable></Pressable></Modal>;
}

function commandIcon(command: Command): string {
  const type = command.payload.type;
  if (type === 'device_mode') return 'ϟ';
  if (type === 'relay_set') return '⌁';
  if (type === 'calibrate_co' || type === 'calibrate_no2') return '⚙';
  return '◌';
}

function commandLabel(command: Command): string {
  const payload = command.payload;
  if (payload.type === 'device_mode') return `Mode: ${String(payload.mode ?? '?')}`;
  if (payload.type === 'relay_set') return `Relay ${String(payload.relay ?? '?')}: ${payload.state === true ? 'ON' : 'OFF'}`;
  if (payload.type === 'calibrate_co') return 'Calibrate CO sensor';
  if (payload.type === 'calibrate_no2') return 'Calibrate NO₂ sensor';
  return typeof payload.type === 'string' ? payload.type : 'unknown';
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  emptyList: { flexGrow: 1 },
  appBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 56 },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backGlyph: { fontSize: 36, fontWeight: '300', lineHeight: 38 },
  appBarTitle: { flex: 1, fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: '600', marginHorizontal: 4 },
  filters: { flexDirection: 'row', gap: 8 },
  filterChip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  skeleton: { height: 72 },
  message: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  messageGlyph: { fontSize: 44 },
  messageBody: { maxWidth: 320, textAlign: 'center' },
  retry: { alignItems: 'center', height: 48, justifyContent: 'center', minWidth: 112, paddingHorizontal: 18 },
  commandRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 72, paddingVertical: 12 },
  iconTile: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  iconGlyph: { fontSize: 16 },
  commandCopy: { flex: 1 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5 },
  modalBackdrop: { backgroundColor: '#00000066', flex: 1, justifyContent: 'flex-end' },
  sheet: { minHeight: 180 },
  payload: { fontFamily: 'JetBrainsMono', fontSize: 12, lineHeight: 18 },
});
