import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBar, Card, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { useAppTheme } from '../../../design/ThemeProvider';
import type { AppStackParamList } from '../../../navigation/types';
import { useMemberMutations } from './hooks/useMemberMutations';

type Props = NativeStackScreenProps<AppStackParamList, 'MemberInvite'>;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MemberInviteScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const { inviteMember, isInviting } = useMemberMutations(route.params.homeId);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!emailPattern.test(normalized)) { setError('Enter a valid email address.'); return; }
    setError(null);
    try { await inviteMember({ email: normalized }); setSent(true); } catch (inviteError) { setError(inviteError instanceof Error ? inviteError.message : 'Unable to invite member'); }
  };
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}><AppBar onBack={() => navigation.goBack()} title="Invite member" /><View style={[styles.content, { padding: theme.spacing.xxl }]}><Card>{sent ? <Text style={[theme.typography.body, { color: theme.colors.brand }]} testID="member-invite-success">Invitation sent if the account exists.</Text> : <>{error === null ? null : <Text style={[theme.typography.caption, { color: theme.colors.danger, marginBottom: theme.spacing.md }]} testID="member-invite-error">{error}</Text>}<TextInput autoCapitalize="none" autoFocus keyboardType="email-address" onChangeText={setEmail} placeholder="Email address" placeholderTextColor={theme.colors.textSecondary} style={[styles.input, { borderBottomColor: theme.colors.border, color: theme.colors.textPrimary }]} testID="member-invite-email" value={email} /></>}</Card><View style={styles.actions}><PrimaryButton label={sent ? 'Done' : error === null ? 'Invite' : 'Retry'} loading={isInviting} onPress={() => { if (sent) navigation.goBack(); else submit().catch(() => undefined); }} testID="member-invite-submit" /><View style={{ marginTop: theme.spacing.lg }}><SecondaryButton label="Cancel" onPress={() => navigation.goBack()} /></View></View></View></SafeAreaView>;
}

const styles = StyleSheet.create({ actions: { marginTop: 'auto' }, content: { flex: 1 }, input: { borderBottomWidth: 1, minHeight: 48 }, screen: { flex: 1 } });
