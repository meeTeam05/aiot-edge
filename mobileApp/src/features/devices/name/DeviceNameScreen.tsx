import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Card, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { useAppTheme } from '../../../design/ThemeProvider';
import type { AppStackParamList } from '../../../navigation/types';
import { deviceDashboardQueryKeys } from '../../device/hooks/useDeviceDashboardQueries';
import { homeQueryKeys } from '../../home/hooks/useHomeQueries';
import type { Device } from '../../home/models/homeModels';
import { renameDevice } from './deviceNameService';

type Props = NativeStackScreenProps<AppStackParamList, 'DeviceName'> & {
  saveDeviceName?: (deviceId: string, name: string) => Promise<Device>;
};

function defaultName(deviceId: string): string {
  const hex = deviceId.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  const suffix = hex.length > 0 ? hex.slice(-6) : deviceId.slice(-6).toUpperCase();
  return suffix.length > 0 ? `Smart Air ${suffix}` : 'Smart Air';
}

/** Flutter Step 5 name field; room assignment continues on the next migration screen. */
export function DeviceNameScreen({ navigation, route, saveDeviceName = renameDevice }: Props) {
  const { theme } = useAppTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState(() => defaultName(route.params.deviceId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const deviceId = route.params.deviceId;

  const save = async () => {
    if (saving) return;
    setError(null);
    try {
      setSaving(true);
      const updated = await saveDeviceName(deviceId, name);
      queryClient.setQueryData<Device[]>(homeQueryKeys.devices(), current => {
        const existing = current ?? [];
        const index = existing.findIndex(device => device.id.toLowerCase() === updated.id.toLowerCase());
        return index < 0 ? [...existing, updated] : existing.map(device => device.id.toLowerCase() === updated.id.toLowerCase() ? updated : device);
      });
      queryClient.setQueryData<Device>(deviceDashboardQueryKeys.device(updated.id), updated);
      navigation.replace('RoomAssignment', { deviceId: updated.id, homeId: updated.homeId });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save device name');
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
    <View style={[styles.header, { paddingHorizontal: theme.spacing.xxl }]}><Pressable accessibilityLabel="Cancel naming" accessibilityRole="button" onPress={() => navigation.navigate('Tabs')} testID="device-name-cancel"><AppIcon color={theme.colors.textPrimary} name="close" size={24} /></Pressable><Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Provisioning</Text><View style={styles.closeSpacer} /></View>
    <View style={[styles.content, { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Name your device</Text>
      <Text style={[theme.typography.body, styles.subtitle, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>This is the label your household will see in the Home tab and dashboard.</Text>
      <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xxxl }} style={styles.body}><Card>
        {error === null ? null : <View style={styles.error} testID="device-name-error"><AppIcon color={theme.colors.danger} name="warning" size={20} /><Text style={[theme.typography.caption, { color: theme.colors.danger, marginLeft: theme.spacing.md }]}>{error}</Text></View>}
        <Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>Device name</Text>
        <TextInput autoFocus onChangeText={setName} onSubmitEditing={() => { save().catch(() => undefined); }} placeholder="Device name" placeholderTextColor={theme.colors.textSecondary} style={[styles.field, { borderColor: theme.colors.border, borderRadius: theme.radius.input, color: theme.colors.textPrimary }]} testID="device-name-input" value={name} />
      </Card></ScrollView>
      <PrimaryButton disabled={saving} label={saving ? 'Saving…' : error === null ? 'Save' : 'Retry'} loading={saving} onPress={() => { save().catch(() => undefined); }} testID="device-name-save" />
      <View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Back" onPress={() => navigation.goBack()} testID="device-name-back" /></View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', height: 52, justifyContent: 'space-between' }, closeSpacer: { width: 24 }, content: { flex: 1 }, title: { fontFamily: 'PlusJakartaSans', fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 24 }, subtitle: { lineHeight: 22 }, body: { flex: 1 }, error: { alignItems: 'center', flexDirection: 'row', marginBottom: 16 }, field: { borderWidth: 1, minHeight: 52, paddingHorizontal: 16 } });
