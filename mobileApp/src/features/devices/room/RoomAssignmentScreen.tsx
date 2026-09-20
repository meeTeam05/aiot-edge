import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Card, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { useAppTheme } from '../../../design/ThemeProvider';
import type { AppStackParamList } from '../../../navigation/types';
import { deviceDashboardQueryKeys } from '../../device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys, useRoomsQuery } from '../../home/hooks/useHomeQueries';
import type { Device, Room } from '../../home/models/homeModels';
import { assignDeviceRoom } from './roomService';
import { validatedRoomId } from './models/roomAssignmentModels';

type Props = NativeStackScreenProps<AppStackParamList, 'RoomAssignment'> & {
  saveRoom?: (deviceId: string, roomId: string | null) => Promise<Device>;
};

/** Flutter Step 5 room picker split out after device naming by this migration phase. */
export function RoomAssignmentScreen({ navigation, route, saveRoom = assignDeviceRoom }: Props) {
  const { theme } = useAppTheme();
  const queryClient = useQueryClient();
  const roomsQuery = useRoomsQuery(route.params.homeId);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaveError(null);
    try {
      setSaving(true);
      const updated = await saveRoom(route.params.deviceId, validatedRoomId(selectedRoomId));
      queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => {
        const existing = current ?? [];
        const index = existing.findIndex(device => device.id.toLowerCase() === updated.id.toLowerCase());
        return index < 0 ? [...existing, updated] : existing.map(device => device.id.toLowerCase() === updated.id.toLowerCase() ? updated : device);
      });
      queryClient.setQueryData<Device>(deviceDashboardQueryKeys.device(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: homeQueryKeys.devices() }).catch(() => undefined);
      navigation.replace('ProvisionComplete', {
        deviceId: updated.id,
        deviceName: updated.name,
        homeId: route.params.homeId,
        roomName: rooms.find(room => room.id === updated.roomId)?.name ?? null,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to assign room');
    } finally {
      setSaving(false);
    }
  };

  const rooms = roomsQuery.data ?? [];
  const loadError = roomsQuery.error instanceof Error ? roomsQuery.error.message : roomsQuery.error === null ? null : 'Unable to load rooms';
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
    <View style={[styles.header, { paddingHorizontal: theme.spacing.xxl }]}><Pressable accessibilityLabel="Cancel room assignment" accessibilityRole="button" onPress={() => navigation.navigate('Tabs')} testID="room-assignment-cancel"><AppIcon color={theme.colors.textPrimary} name="close" size={24} /></Pressable><Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Provisioning</Text><View style={styles.closeSpacer} /></View>
    <View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Choose a room</Text>
      <Text style={[theme.typography.body, styles.subtitle, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Select where this device is located.</Text>
      <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xxxl }} style={styles.body}><Card>
        {roomsQuery.isLoading ? <View style={styles.state} testID="room-assignment-loading"><ActivityIndicator color={theme.colors.brand} /><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Loading rooms…</Text></View> : loadError !== null ? <View style={styles.state} testID="room-assignment-error"><AppIcon color={theme.colors.danger} name="warning" size={28} /><Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.lg }]}>Unable to continue</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.danger, marginTop: theme.spacing.sm }]}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => roomsQuery.refetch().catch(() => undefined)} style={{ marginTop: theme.spacing.xl }} testID="room-load-retry"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>Retry</Text></Pressable></View> : rooms.length === 0 ? <View style={styles.state} testID="room-assignment-empty"><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>No rooms available</Text><Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>Add a room from your home settings, then return to finish setup.</Text><Pressable accessibilityRole="button" onPress={() => roomsQuery.refetch().catch(() => undefined)} style={{ marginTop: theme.spacing.xl }} testID="room-empty-retry"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>Retry</Text></Pressable></View> : <View>{saveError === null ? null : <View style={styles.inlineError} testID="room-assignment-save-error"><AppIcon color={theme.colors.danger} name="warning" size={20} /><Text style={[theme.typography.caption, { color: theme.colors.danger, marginLeft: theme.spacing.md }]}>{saveError}</Text></View>}{rooms.map(room => <RoomOption key={room.id} onPress={() => setSelectedRoomId(room.id)} room={room} selected={selectedRoomId === room.id} theme={theme} />)}</View>}
      </Card></ScrollView>
      <PrimaryButton disabled={saving || roomsQuery.isLoading || rooms.length === 0 || loadError !== null} label={saving ? 'Saving…' : saveError === null ? 'Save' : 'Retry'} loading={saving} onPress={() => { save().catch(() => undefined); }} testID="room-assignment-save" />
      <View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Back" onPress={() => navigation.goBack()} testID="room-assignment-back" /></View>
    </View>
  </SafeAreaView>;
}

function RoomOption({ onPress, room, selected, theme }: { onPress: () => void; room: Room; selected: boolean; theme: ReturnType<typeof useAppTheme>['theme'] }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.room, { borderBottomColor: theme.colors.border }]} testID={`room-option-${room.id}`}><View><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{room.name}</Text></View><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{selected ? '✓' : ''}</Text></Pressable>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', height: 52, justifyContent: 'space-between' }, closeSpacer: { width: 24 }, content: { flex: 1 }, title: { fontFamily: 'PlusJakartaSans', fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 24 }, subtitle: { lineHeight: 22 }, body: { flex: 1 }, state: { alignItems: 'center', minHeight: 200, justifyContent: 'center' }, centered: { lineHeight: 19, textAlign: 'center' }, inlineError: { alignItems: 'center', flexDirection: 'row', marginBottom: 16 }, room: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58 } });
