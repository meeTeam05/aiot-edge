import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar, Card, ConfirmDialog, PrimaryButton } from '../../components/ui';
import { useAppTheme } from '../../design/ThemeProvider';
import type { AppStackParamList } from '../../navigation/types';
import { useSessionStore } from '../../state/sessionStore';
import { useHomeMutations } from './hooks/useHomeMutations';
import { useHomesQuery, useRoomsQuery } from './hooks/useHomeQueries';
import { useRoomMutations } from './room/hooks/useRoomMutations';

type Props = NativeStackScreenProps<AppStackParamList, 'HomeDetail'>;

/** Flutter HomeDetail parity for home information, rooms, and invite-only household API. */
export function HomeDetailScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const homesQuery = useHomesQuery();
  const currentUser = useSessionStore(state => state.user);
  const { deleteHome, isDeleting, isUpdating, updateHome } = useHomeMutations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingHomeDelete, setConfirmingHomeDelete] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const home = homesQuery.data?.find(item => item.id === route.params.homeId);
  const owner = currentUser !== null && home?.ownerId === currentUser.id;
  const roomsQuery = useRoomsQuery(home?.id ?? '');
  const { deleteRoom, isDeleting: isDeletingRoom } = useRoomMutations(home?.id ?? '');

  if (homesQuery.isLoading && home === undefined) return <ScreenState body="Loading home…" testID="home-detail-loading" theme={theme} title="Home" onBack={() => navigation.goBack()} />;
  if (home === undefined) return <ScreenState body={homesQuery.isError ? errorMessage(homesQuery.error) : 'This home is no longer available in your current session.'} testID="home-detail-error" theme={theme} title="Home not found" onBack={() => navigation.goBack()} />;

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter a home name.'); return; }
    setError(null);
    try { await updateHome(home.id, { name: trimmed }); setEditing(false); } catch (saveError) { setError(errorMessage(saveError)); }
  };
  const removeHome = async () => {
    try { await deleteHome(home.id); setConfirmingHomeDelete(false); navigation.goBack(); } catch (deleteError) { setConfirmingHomeDelete(false); setError(errorMessage(deleteError)); }
  };
  const removeRoom = async () => {
    if (roomToDelete === null) return;
    try { await deleteRoom(roomToDelete); setRoomToDelete(null); } catch (deleteError) { setRoomToDelete(null); setError(errorMessage(deleteError)); }
  };
  const refresh = () => { homesQuery.refetch().catch(() => undefined); roomsQuery.refetch().catch(() => undefined); };

  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><AppBar onBack={() => navigation.goBack()} title={home.name} /><ScrollView contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.huge }} refreshControl={<RefreshControl colors={[theme.colors.brand]} onRefresh={refresh} refreshing={homesQuery.isRefetching || roomsQuery.isRefetching} />}><HomeNameSection editing={editing} error={error} homeName={editing ? name : home.name} isUpdating={isUpdating} onChange={setName} onEdit={() => { setError(null); setName(home.name); setEditing(true); }} onSave={() => { saveName().catch(() => undefined); }} owner={owner} theme={theme} /><HomeInformation address={home.address} timezone={home.timezone} theme={theme} /><MemberSection currentEmail={currentUser?.email ?? 'Current user'} owner={owner} onInvite={() => navigation.navigate('MemberInvite', { homeId: home.id })} theme={theme} /><RoomsSection canManage={owner} error={error} homeId={home.id} isDeleting={isDeletingRoom} onAdd={() => navigation.navigate('RoomForm', { homeId: home.id })} onDelete={roomId => setRoomToDelete(roomId)} onEdit={(roomId, roomName) => navigation.navigate('RoomForm', { homeId: home.id, roomId, roomName })} onRetry={() => roomsQuery.refetch().catch(() => undefined)} rooms={roomsQuery.data ?? []} roomsError={roomsQuery.error} roomsLoading={roomsQuery.isLoading} theme={theme} />{owner ? <View style={{ marginTop: theme.spacing.huge }}><Text style={[theme.typography.label, { color: theme.colors.danger }]}>DANGER ZONE</Text><PrimaryButton label={isDeleting ? 'Deleting…' : 'Delete home'} loading={isDeleting} onPress={() => setConfirmingHomeDelete(true)} testID="home-detail-delete" /></View> : null}</ScrollView><ConfirmDialog confirmLabel="Delete" destructive message="This deletes the home, every device in it, and their associated data." onCancel={() => setConfirmingHomeDelete(false)} onConfirm={() => { removeHome().catch(() => undefined); }} title="Delete home" visible={confirmingHomeDelete} /><ConfirmDialog confirmLabel="Delete" destructive message="Devices assigned to this room will remain in the home but lose the room assignment." onCancel={() => setRoomToDelete(null)} onConfirm={() => { removeRoom().catch(() => undefined); }} title="Delete room" visible={roomToDelete !== null} /></SafeAreaView>;
}

function HomeNameSection({ editing, error, homeName, isUpdating, onChange, onEdit, onSave, owner, theme }: { editing: boolean; error: string | null; homeName: string; isUpdating: boolean; onChange: (value: string) => void; onEdit: () => void; onSave: () => void; owner: boolean; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <><Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>HOME NAME</Text><Card style={{ marginTop: theme.spacing.lg }}>{error === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.danger, marginBottom: theme.spacing.md }]} testID="home-detail-error-message">{error}</Text>}<View style={styles.row}>{editing ? <TextInput autoFocus onChangeText={onChange} style={[styles.nameInput, { borderBottomColor: theme.colors.border, color: theme.colors.textPrimary }]} testID="home-detail-name-input" value={homeName} /> : <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{homeName}</Text>}{owner ? <Pressable accessibilityLabel={editing ? 'Save home name' : 'Edit home name'} accessibilityRole="button" disabled={isUpdating} onPress={editing ? onSave : onEdit} testID="home-detail-edit"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{isUpdating ? 'Saving…' : editing ? 'Save' : 'Edit'}</Text></Pressable> : null}</View></Card></>;
}

function HomeInformation({ address, theme, timezone }: { address: string | null; theme: ReturnType<typeof useAppTheme>['theme']; timezone: string }) {
  return <>{address === null ? null : <><Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxxl }]}>ADDRESS</Text><Card style={{ marginTop: theme.spacing.lg }}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{address}</Text></Card></>}<Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxxl }]}>TIMEZONE</Text><Card style={{ marginTop: theme.spacing.lg }}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{timezone}</Text></Card></>;
}

function MemberSection({ currentEmail, onInvite, owner, theme }: { currentEmail: string; onInvite: () => void; owner: boolean; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <View style={{ marginTop: theme.spacing.xxxl }}><View style={styles.row}><Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>MEMBERS</Text>{owner ? <Pressable accessibilityLabel="Invite member" accessibilityRole="button" onPress={onInvite} testID="member-invite"><Text style={[theme.typography.caption, { color: theme.colors.brand }]}>+ Invite</Text></Pressable> : null}</View><Card style={{ marginTop: theme.spacing.lg }} testID="member-list"><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{currentEmail}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{owner ? 'Owner · You' : 'Member · You'}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>The current API exposes invite actions, but it does not return a full member list yet.</Text></Card></View>;
}

function RoomsSection({ canManage, error, homeId, isDeleting, onAdd, onDelete, onEdit, onRetry, rooms, roomsError, roomsLoading, theme }: { canManage: boolean; error: string | null; homeId: string; isDeleting: boolean; onAdd: () => void; onDelete: (roomId: string) => void; onEdit: (roomId: string, roomName: string) => void; onRetry: () => void; rooms: { id: string; name: string }[]; roomsError: unknown; roomsLoading: boolean; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <View style={{ marginTop: theme.spacing.xxxl }}><View style={styles.row}><Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>ROOMS</Text>{canManage ? <Pressable accessibilityLabel="Add room" accessibilityRole="button" onPress={onAdd} testID="room-add"><Text style={[theme.typography.caption, { color: theme.colors.brand }]}>+ Add</Text></Pressable> : null}</View><Card style={{ marginTop: theme.spacing.lg }} testID="room-list">{roomsLoading ? <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]} testID="room-list-loading">Loading rooms…</Text> : roomsError !== null && roomsError !== undefined ? <View testID="room-list-error"><Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{errorMessage(roomsError)}</Text><Pressable accessibilityLabel="Retry rooms" accessibilityRole="button" onPress={onRetry}><Text style={[theme.typography.caption, { color: theme.colors.brand, marginTop: theme.spacing.md }]}>Retry</Text></Pressable></View> : rooms.length === 0 ? <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]} testID="room-list-empty">No rooms yet</Text> : rooms.map(room => <View key={room.id} style={[styles.room, { borderBottomColor: theme.colors.border }]}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{room.name}</Text>{canManage ? <View style={styles.roomActions}><Pressable accessibilityLabel={`Edit ${room.name}`} accessibilityRole="button" onPress={() => onEdit(room.id, room.name)}><Text style={[theme.typography.caption, { color: theme.colors.brand }]}>Edit</Text></Pressable><Pressable accessibilityLabel={`Delete ${room.name}`} accessibilityRole="button" disabled={isDeleting} onPress={() => onDelete(room.id)}><Text style={[theme.typography.caption, { color: theme.colors.danger, marginLeft: theme.spacing.lg }]}>{isDeleting ? 'Deleting…' : 'Delete'}</Text></Pressable></View> : null}</View>)}</Card>{error === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing.md }]}>{error}</Text>}<Text accessibilityElementsHidden style={styles.hidden}>{homeId}</Text></View>;
}

function ScreenState({ body, onBack, testID, theme, title }: { body: string; onBack: () => void; testID: string; theme: ReturnType<typeof useAppTheme>['theme']; title: string }) { return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><AppBar onBack={onBack} title="Home" /><View style={styles.state} testID={testID}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>{title}</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{body}</Text></View></SafeAreaView>; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const styles = StyleSheet.create({ screen: { flex: 1 }, state: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, nameInput: { borderBottomWidth: 1, flex: 1, marginRight: 16, paddingVertical: 4 }, room: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 46 }, roomActions: { alignItems: 'center', flexDirection: 'row' }, hidden: { height: 0 } });
