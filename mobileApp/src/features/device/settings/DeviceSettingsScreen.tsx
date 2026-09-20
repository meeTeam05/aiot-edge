import { useState } from 'react';
import { Alert, Clipboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppTheme } from '../../../design/ThemeProvider';
import { getTheme } from '../../../design/theme';
import type { AppStackParamList } from '../../../navigation/types';
import type { Device, Room } from '../../home/models/homeModels';
import { useDeviceSettings } from './hooks/useDeviceSettings';

type Props = NativeStackScreenProps<AppStackParamList, 'DeviceSettings'>;

/** Flutter GeneralSettingsScreen parity; OTA and calibration remain entry points only. */
export function DeviceSettingsScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [roomPickerVisible, setRoomPickerVisible] = useState(false);
  const settings = useDeviceSettings(route.params.deviceId);
  const device = settings.device;
  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('DeviceDetail', { deviceId: route.params.deviceId });
  };

  if (settings.isLoading && device === undefined) return <SettingsState loading onBack={goBack} theme={theme} />;
  if (settings.deviceError !== null && settings.deviceError !== undefined) return <SettingsState error={errorMessage(settings.deviceError)} onBack={goBack} onRetry={() => navigation.replace('DeviceSettings', { deviceId: route.params.deviceId })} theme={theme} />;
  if (device === undefined || device === null) return <SettingsState error="This device may have been removed or is no longer available." onBack={goBack} onRetry={() => navigation.navigate('Tabs')} theme={theme} title="Device not found" />;

  const saveName = () => {
    const nextName = name.trim();
    if (nextName.length === 0) return;
    settings.updateDevice({ name: nextName }).then(() => {
      setEditingName(false);
      Alert.alert('Device name updated');
    }).catch(error => Alert.alert('Failed to update name', errorMessage(error)));
  };
  const updateRoom = (roomId: string | null) => {
    setRoomPickerVisible(false);
    settings.updateDevice({ roomId }).then(() => Alert.alert('Room updated')).catch(error => Alert.alert('Failed to update room', errorMessage(error)));
  };
  const confirmDelete = () => Alert.alert('Delete device?', `This will permanently remove "${device.name}" from your home. This action cannot be undone.`, [
    { style: 'cancel', text: 'Cancel' },
    { style: 'destructive', text: 'Delete', onPress: () => settings.deleteDevice().then(() => navigation.navigate('Tabs')).catch(error => Alert.alert('Failed to delete device', errorMessage(error))) },
  ]);

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
    <SettingsAppBar onBack={goBack} theme={theme} />
    <ScrollView contentContainerStyle={{ padding: theme.spacing.xxl, paddingBottom: theme.spacing.huge }}>
      <Section title="General" theme={theme}><SettingsCard theme={theme}>
        <SettingsRow label="Device name" theme={theme}>
          {editingName ? <View style={styles.nameEdit}><TextInput autoFocus onChangeText={setName} onSubmitEditing={saveName} style={[styles.nameInput, theme.typography.body, { borderColor: theme.colors.border, color: theme.colors.textPrimary }]} testID="device-name-input" value={name} /><Pressable accessibilityLabel="Save device name" disabled={settings.isUpdating} onPress={saveName} testID="save-device-name"><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{settings.isUpdating ? 'Saving…' : 'Save'}</Text></Pressable></View> : <View style={styles.valueAction}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{device.name}</Text><Pressable accessibilityLabel="Edit device name" onPress={() => { setName(device.name); setEditingName(true); }} testID="edit-device-name"><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Edit</Text></Pressable></View>}
        </SettingsRow>
        <SettingsRow label="Device ID" theme={theme}><View style={styles.valueAction}><Text selectable style={[styles.mono, { color: theme.colors.textPrimary }]}>{device.id}</Text><Pressable accessibilityLabel="Copy device ID" onPress={() => { Clipboard.setString(device.id); Alert.alert('Device ID copied'); }} testID="copy-device-id"><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Copy</Text></Pressable></View></SettingsRow>
        <SettingsRow label="Room" theme={theme}><Pressable accessibilityLabel="Select room" disabled={settings.roomsLoading || settings.isUpdating} onPress={() => setRoomPickerVisible(true)} style={styles.valueAction} testID="select-device-room"><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{roomName(device, settings.rooms, settings.roomsLoading)}</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{settings.roomsLoading ? 'Loading…' : '›'}</Text></Pressable></SettingsRow>
        <SettingsRow label="Firmware version" theme={theme} last><Pressable accessibilityLabel="Firmware update" onPress={() => navigation.navigate('DeviceOta', { deviceId: device.id })} style={styles.valueAction} testID="ota-entry"><Text style={[styles.mono, { color: theme.colors.textPrimary }]}>{device.firmwareVer ?? 'Unknown'}</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>›</Text></Pressable></SettingsRow>
      </SettingsCard></Section>
      <Section title="Sensor calibration" theme={theme}><SettingsCard theme={theme}><SettingsRow label="CO sensor" subtitle="Calibration recommended" theme={theme}><EntryRow label="CO sensor" onPress={() => navigation.navigate('DeviceCalibration', { deviceId: device.id, sensor: 'co' })} testID="co-calibration-entry" theme={theme} /></SettingsRow><SettingsRow label="NO₂ sensor" subtitle="Calibration recommended" theme={theme} last><EntryRow label="NO₂ sensor" onPress={() => navigation.navigate('DeviceCalibration', { deviceId: device.id, sensor: 'no2' })} testID="no2-calibration-entry" theme={theme} /></SettingsRow></SettingsCard></Section>
      <Section title="Danger zone" tone="danger" theme={theme}><SettingsCard theme={theme}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>Delete this device</Text><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>This will remove the device from your home. You can re-add it later through provisioning.</Text><Pressable accessibilityRole="button" disabled={settings.isDeleting} onPress={confirmDelete} style={[styles.deleteButton, settings.isDeleting ? styles.disabled : null, { backgroundColor: theme.colors.danger, borderRadius: theme.radius.button, marginTop: theme.spacing.xl }]} testID="delete-device"><Text style={[theme.typography.body, { color: theme.colors.surface }]}>{settings.isDeleting ? 'Deleting…' : 'Delete device'}</Text></Pressable></SettingsCard></Section>
    </ScrollView>
    <RoomPicker device={device} onDismiss={() => setRoomPickerVisible(false)} onSelect={updateRoom} rooms={settings.rooms} theme={theme} visible={roomPickerVisible} />
  </SafeAreaView>;
}

function SettingsAppBar({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof getTheme> }) { return <View style={[styles.appBar, { borderBottomColor: theme.colors.border, paddingHorizontal: theme.spacing.xl }]}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.appBarButton} testID="device-settings-back"><Text style={[styles.backGlyph, { color: theme.colors.textPrimary }]}>‹</Text></Pressable><Text style={[styles.appBarTitle, { color: theme.colors.textPrimary }]}>Settings</Text><View style={styles.appBarButton} /></View>; }
function SettingsState({ error, loading = false, onBack, onRetry, theme, title = 'Failed to load device' }: { error?: string; loading?: boolean; onBack: () => void; onRetry?: () => void; theme: ReturnType<typeof getTheme>; title?: string }) { return <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}><SettingsAppBar onBack={onBack} theme={theme} /><View style={styles.state} testID={loading ? 'device-settings-loading' : 'device-settings-error'}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>{loading ? 'Loading settings…' : title}</Text>{!loading ? <><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={[styles.retry, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, marginTop: theme.spacing.xxl }]} testID="device-settings-retry"><Text style={[theme.typography.body, { color: theme.colors.surface }]}>Retry</Text></Pressable></> : null}</View></SafeAreaView>; }
function Section({ children, title, tone, theme }: { children: React.ReactNode; title: string; tone?: 'danger'; theme: ReturnType<typeof getTheme> }) { return <View style={{ marginBottom: theme.spacing.xxxl }}><Text style={[theme.typography.h2, { color: tone === 'danger' ? theme.colors.danger : theme.colors.textPrimary, marginBottom: theme.spacing.lg }]}>{title}</Text>{children}</View>; }
function SettingsCard({ children, theme }: { children: React.ReactNode; theme: ReturnType<typeof getTheme> }) { return <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}>{children}</View>; }
function SettingsRow({ children, label, last = false, subtitle, theme }: { children: React.ReactNode; label: string; last?: boolean; subtitle?: string; theme: ReturnType<typeof getTheme> }) { return <View style={[styles.row, !last ? { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null, { padding: theme.spacing.xl }]}><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{label}</Text>{subtitle !== undefined ? <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}>{subtitle}</Text> : null}<View style={{ marginTop: theme.spacing.sm }}>{children}</View></View>; }
function EntryRow({ label, onPress, testID, theme }: { label: string; onPress: () => void; testID: string; theme: ReturnType<typeof getTheme> }) { return <Pressable accessibilityLabel={label} onPress={onPress} style={styles.valueAction} testID={testID}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{label}</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>›</Text></Pressable>; }
function RoomPicker({ device, onDismiss, onSelect, rooms, theme, visible }: { device: Device; onDismiss: () => void; onSelect: (roomId: string | null) => void; rooms: Room[]; theme: ReturnType<typeof getTheme>; visible: boolean }) { return <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}><Pressable onPress={onDismiss} style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.card, borderTopRightRadius: theme.radius.card, padding: theme.spacing.xxl }]}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }]}>Room</Text><Pressable onPress={() => onSelect(null)} style={styles.pickerRow} testID="room-option-none"><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>No room</Text><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{device.roomId === null ? '✓' : ''}</Text></Pressable>{rooms.map(room => <Pressable key={room.id} onPress={() => onSelect(room.id)} style={styles.pickerRow} testID={`room-option-${room.id}`}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{room.name}</Text><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{device.roomId === room.id ? '✓' : ''}</Text></Pressable>)}</View></Pressable></Modal>; }
function roomName(device: Device, rooms: Room[], loading: boolean): string { if (loading) return 'Loading rooms…'; return device.roomId === null ? 'No room assigned' : rooms.find(room => room.id === device.roomId)?.name ?? 'Unknown room'; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const styles = StyleSheet.create({ safeArea: { flex: 1 }, appBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 56 }, appBarButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, backGlyph: { fontSize: 36, fontWeight: '300', lineHeight: 38 }, appBarTitle: { flex: 1, fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: '600', marginHorizontal: 4 }, state: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 }, retry: { alignItems: 'center', height: 48, justifyContent: 'center', minWidth: 112, paddingHorizontal: 18 }, card: { borderWidth: 1, overflow: 'hidden' }, row: {}, valueAction: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, nameEdit: { alignItems: 'center', flexDirection: 'row', gap: 12 }, nameInput: { borderBottomWidth: 1, flex: 1, paddingVertical: 4 }, mono: { fontFamily: 'JetBrainsMono', fontSize: 13 }, deleteButton: { alignItems: 'center', height: 48, justifyContent: 'center' }, disabled: { opacity: 0.6 }, backdrop: { backgroundColor: '#00000066', flex: 1, justifyContent: 'flex-end' }, sheet: { minHeight: 180 }, pickerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 } });
