import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar, Card, PrimaryButton, SecondaryButton } from '../../components/ui';
import { useAppTheme } from '../../design/ThemeProvider';
import type { AppStackParamList } from '../../navigation/types';
import { useHomeMutations } from './hooks/useHomeMutations';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateHome'>;

/** Flutter CreateHomeScreen parity over the established POST /homes contract. */
export function CreateHomeScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const { createHome, isCreating } = useHomeMutations();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Name required');
      return;
    }
    setError(null);
    try {
      await createHome({ name: trimmed });
      navigation.goBack();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create home');
    }
  };

  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><AppBar onBack={() => navigation.goBack()} testID="create-home-back" title="New Home" /><View style={[styles.content, { padding: theme.spacing.xxl }]}><ScrollView keyboardShouldPersistTaps="handled"><Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>HOME NAME</Text><Card style={{ marginTop: theme.spacing.lg }}>{error === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.danger, marginBottom: theme.spacing.md }]} testID="create-home-error">{error}</Text>}<TextInput autoFocus onChangeText={setName} onSubmitEditing={() => { submit().catch(() => undefined); }} placeholder="e.g. My Apartment" placeholderTextColor={theme.colors.textSecondary} style={[styles.input, { borderColor: theme.colors.border, borderRadius: theme.radius.input, color: theme.colors.textPrimary }]} testID="create-home-name" value={name} /></Card></ScrollView><PrimaryButton label={error === null ? 'Create' : 'Retry'} loading={isCreating} onPress={() => { submit().catch(() => undefined); }} testID="create-home-submit" /><View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Cancel" onPress={() => navigation.goBack()} testID="create-home-cancel" /></View></View></SafeAreaView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { flex: 1 }, input: { borderWidth: 1, minHeight: 52, paddingHorizontal: 16 } });
