import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback } from 'react';

import { useAppTheme } from '../../design/ThemeProvider';
import { useActiveHomeSelection, useHomesQuery } from './hooks/useHomeQueries';
import type { Home } from './models/homeModels';

interface HomeListScreenProps {
  onCreateHome?: () => void;
  onOpenProfile?: () => void;
  onOpenHome?: (homeId: string) => void;
  onSelected?: () => void;
}

/** Flutter HomesScreen parity: authenticated home list, refresh, and session selection. */
export function HomeListScreen({ onCreateHome, onOpenHome, onOpenProfile, onSelected }: HomeListScreenProps) {
  const { theme } = useAppTheme();
  const homesQuery = useHomesQuery();
  const homes = homesQuery.data ?? [];
  const { activeHomeId, selectHome } = useActiveHomeSelection(homes);
  const retry = () => { homesQuery.refetch().catch(() => undefined); };
  const choose = (homeId: string) => {
    selectHome(homeId);
    if (onOpenHome !== undefined) onOpenHome(homeId);
    else onSelected?.();
  };

  if (homesQuery.isLoading && homesQuery.data === undefined) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}><HomeListAppBar onOpenProfile={onOpenProfile} theme={theme} /><View style={styles.center} testID="homes-loading"><ActivityIndicator color={theme.colors.brand} /></View></SafeAreaView>;
  }
  if (homesQuery.isError && homesQuery.data === undefined) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}><HomeListAppBar onOpenProfile={onOpenProfile} theme={theme} /><HomeListMessage action="Retry" body={errorMessage(homesQuery.error)} onAction={retry} testID="homes-error" theme={theme} title="Failed to load homes" /></SafeAreaView>;
  }
  if (homes.length === 0) {
    return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}><HomeListAppBar onOpenProfile={onOpenProfile} theme={theme} /><HomeListMessage action="Create Home" body="Create a home to organize your Smart Air devices." onAction={onCreateHome} testID="homes-empty" theme={theme} title="No homes yet" /></SafeAreaView>;
  }

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}><HomeListAppBar onOpenProfile={onOpenProfile} theme={theme} /><HomeRows activeHomeId={activeHomeId} homes={homes} onRefresh={retry} onSelect={choose} refreshing={homesQuery.isRefetching} theme={theme} /><Pressable accessibilityLabel="Create home" accessibilityRole="button" onPress={onCreateHome} style={[styles.fab, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.pill }]} testID="homes-create"><Text style={[theme.typography.h2, { color: theme.colors.surface }]}>+</Text></Pressable></SafeAreaView>;
}

function HomeRows({ activeHomeId, homes, onRefresh, onSelect, refreshing, theme }: { activeHomeId: string | null; homes: Home[]; onRefresh: () => void; onSelect: (homeId: string) => void; refreshing: boolean; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  const renderItem = useCallback(({ item }: { item: Home }) => <HomeRow active={item.id === activeHomeId} home={item} onPress={() => onSelect(item.id)} theme={theme} />, [activeHomeId, onSelect, theme]);
  return <FlatList contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.huge }} data={homes} ItemSeparatorComponent={HomeSeparator} keyExtractor={home => home.id} refreshControl={<RefreshControl colors={[theme.colors.brand]} onRefresh={onRefresh} refreshing={refreshing} />} renderItem={renderItem} testID="homes-list" />;
}

function HomeSeparator() { return <View style={styles.separator} />; }

function HomeListAppBar({ onOpenProfile, theme }: { onOpenProfile?: () => void; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <View style={[styles.appBar, { backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.xl }]}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>My Homes</Text><Pressable accessibilityLabel="Profile" accessibilityRole="button" disabled={onOpenProfile === undefined} onPress={onOpenProfile} style={styles.profile}><Text style={[styles.profileGlyph, { color: theme.colors.textSecondary }]}>◯</Text></Pressable></View>;
}

function HomeListMessage({ action, body, onAction, testID, theme, title }: { action: string; body: string; onAction?: () => void; testID: string; theme: ReturnType<typeof useAppTheme>['theme']; title: string }) {
  return <View style={styles.center} testID={testID}><Text style={[styles.homeGlyph, { color: theme.colors.textSecondary }]}>⌂</Text><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.lg }]}>{title}</Text><Text style={[theme.typography.body, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{body}</Text><Pressable accessibilityLabel={action} accessibilityRole="button" disabled={onAction === undefined} onPress={onAction} style={[styles.action, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxl }]}><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{action}</Text></Pressable></View>;
}

function HomeRow({ active, home, onPress, theme }: { active: boolean; home: Home; onPress: () => void; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <Pressable accessibilityLabel={`Select ${home.name}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: theme.colors.surface, borderColor: active ? theme.colors.brand : theme.colors.border, borderRadius: theme.radius.input, opacity: pressed ? 0.75 : 1, padding: theme.spacing.xl }]} testID={`home-row-${home.id}`}><Text style={[styles.homeGlyph, { color: theme.colors.brand }]}>⌂</Text><View style={styles.copy}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{home.name}</Text>{home.address === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{home.address}</Text>}</View><Text style={[theme.typography.body, { color: active ? theme.colors.brand : theme.colors.textSecondary }]}>{active ? 'Selected' : '›'}</Text></Pressable>;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appBar: { alignItems: 'center', flexDirection: 'row', height: 56 },
  profile: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: 'auto', width: 44 },
  profileGlyph: { fontSize: 25 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  homeGlyph: { fontSize: 32 },
  centered: { maxWidth: 300, textAlign: 'center' },
  action: { alignItems: 'center', height: 48, justifyContent: 'center', minWidth: 132, paddingHorizontal: 18 },
  row: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', minHeight: 76 },
  copy: { flex: 1, marginLeft: 14 },
  separator: { height: 8 },
  fab: { alignItems: 'center', bottom: 24, elevation: 6, height: 56, justifyContent: 'center', position: 'absolute', right: 20, width: 56 },
});
