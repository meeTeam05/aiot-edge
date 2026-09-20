import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar, Card, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { useAppTheme } from '../../../design/ThemeProvider';
import type { AppStackParamList } from '../../../navigation/types';
import { useRoomMutations } from './hooks/useRoomMutations';

type Props = NativeStackScreenProps<AppStackParamList, 'RoomForm'>;

export function RoomFormScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const { homeId, roomId, roomName } = route.params;
  const { createRoom, isCreating, isUpdating, updateRoom } = useRoomMutations(homeId);
  const [name, setName] = useState(roomName ?? '');
  const [error, setError] = useState<string | null>(null);
  const editing = roomId !== undefined;
  const saving = isCreating || isUpdating;
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Room name required'); return; }
    setError(null);
    try {
      if (roomId === undefined) await createRoom({ name: trimmed });
      else await updateRoom(roomId, { name: trimmed });
      navigation.goBack();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save room'); }
  };
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><AppBar onBack={() => navigation.goBack()} title={editing ? 'Edit room' : 'Add room'} /><View style={[styles.content, { padding: theme.spacing.xxl }]}><Card>{error === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.danger, marginBottom: theme.spacing.md }]} testID="room-form-error">{error}</Text>}<TextInput autoFocus onChangeText={setName} placeholder="Room name" placeholderTextColor={theme.colors.textSecondary} style={[styles.input, { borderBottomColor: theme.colors.border, color: theme.colors.textPrimary }]} testID="room-form-name" value={name} /></Card><View style={styles.actions}><PrimaryButton label={error === null ? editing ? 'Save' : 'Create' : 'Retry'} loading={saving} onPress={() => { save().catch(() => undefined); }} testID="room-form-submit" /><View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Cancel" onPress={() => navigation.goBack()} /></View></View></View></SafeAreaView>;
}

const styles = StyleSheet.create({ actions: { marginTop: 'auto' }, content: { flex: 1 }, input: { borderBottomWidth: 1, minHeight: 48 }, screen: { flex: 1 } });
