import { useState } from 'react';
import { Alert, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '../../components/BrandMark';
import { useAppTheme } from '../../design/ThemeProvider';
import { getTheme } from '../../design/theme';
import { useProfileLogout, useProfileState } from './hooks/useProfileState';
import type { ProfileHomesState } from './models/profileModels';
import { type ThemePreference } from './services/themePreference';

type Dialog = 'about' | 'logout' | 'theme' | null;

/** Flutter-equivalent Profile tab; account mutations and home management remain out of scope. */
export function ProfileScreen() {
  const { homesState, setThemePreference, themePreference, userDisplay } = useProfileState();
  const logout = useProfileLogout();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { theme } = useAppTheme();
  const { colors, radius, spacing, typography } = theme;

  const confirmLogout = () => {
    setDialog(null);
    logout().catch(() => undefined);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ProfileAppBar theme={theme} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={[typography.pageTitle, { color: colors.textPrimary }]}>Profile</Text>
        <View style={{ marginTop: spacing.xxl }}>
          <AccountCard email={userDisplay?.email ?? ''} fullName={userDisplay?.fullName ?? null} initial={userDisplay?.initial ?? '?'} onEdit={() => Alert.alert('Profile editing coming soon')} theme={theme} />
        </View>
        <SectionLabel label="HOMES" theme={theme} top={spacing.xxxl} />
        <HomesCard homesState={homesState} theme={theme} />
        <SectionLabel label="APP SETTINGS" theme={theme} top={spacing.xxxl} />
        <SettingsCard theme={theme}>
          <SettingRow glyph="☁" label="Theme" onPress={() => setDialog('theme')} theme={theme} trailing={<Text style={[typography.caption, { color: colors.textSecondary }]}>{titleCase(themePreference)} ▾</Text>} />
          <SettingRow glyph="◌" label="Notifications" onPress={() => Alert.alert('Notification settings coming soon')} theme={theme} />
          <Divider theme={theme} />
          <SettingRow glyph="i" label="About" onPress={() => setDialog('about')} theme={theme} />
        </SettingsCard>
        <Pressable accessibilityLabel="Log out" accessibilityRole="button" onPress={() => setDialog('logout')} style={({ pressed }) => [styles.logout, { borderColor: colors.danger, borderRadius: radius.button, marginTop: spacing.huge, opacity: pressed ? 0.75 : 1 }]}>
          <Text style={[typography.body, { color: colors.danger }]}>Logout</Text>
        </Pressable>
      </ScrollView>
      <ProfileDialog dialog={dialog} onClose={() => setDialog(null)} onConfirmLogout={confirmLogout} onThemeSelected={preference => { setThemePreference(preference); setDialog(null); }} theme={theme} themePreference={themePreference} />
    </SafeAreaView>
  );
}

function ProfileAppBar({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.appBar, { backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.xl }]}><BrandMark size={24} /><Text style={[styles.wordmark, { color: theme.colors.textPrimary }]}>Atmosphere</Text></View>;
}

function AccountCard({ email, fullName, initial, onEdit, theme }: { email: string; fullName: string | null; initial: string; onEdit: () => void; theme: ReturnType<typeof getTheme> }) {
  const { colors, radius, spacing, typography } = theme;
  return <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: spacing.xxl }]}><View style={[styles.avatar, { backgroundColor: colors.brandTint }]}><Text style={[typography.h1, { color: colors.brand }]}>{initial}</Text></View><View style={[styles.accountCopy, { marginLeft: spacing.xl }]}>{fullName ? <Text style={[typography.h2, { color: colors.textPrimary }]}>{fullName}</Text> : null}<Text style={[typography.caption, { color: colors.textMuted }]}>{email}</Text></View><Pressable accessibilityLabel="Edit profile" accessibilityRole="button" onPress={onEdit} style={styles.edit}><Text style={[styles.glyph, { color: colors.textSecondary }]}>✎</Text></Pressable></View>;
}

function SectionLabel({ label, theme, top }: { label: string; theme: ReturnType<typeof getTheme>; top: number }) {
  return <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.lg, marginTop: top }]}>{label}</Text>;
}

function HomesCard({ homesState, theme }: { homesState: ProfileHomesState; theme: ReturnType<typeof getTheme> }) {
  const cardStyle = [styles.settingsCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card }];
  if (homesState.kind === 'loading') return <View style={cardStyle} testID="profile-homes-loading"><ActivityIndicator color={theme.colors.brand} style={{ margin: theme.spacing.xl }} /></View>;
  if (homesState.kind === 'error') return <View style={cardStyle} testID="profile-homes-error"><Text style={[theme.typography.caption, { color: theme.colors.danger, margin: theme.spacing.xl }]}>Failed to load homes</Text></View>;
  if (homesState.homes.length === 0) return <View style={cardStyle} testID="profile-homes-empty"><Text style={[theme.typography.caption, { color: theme.colors.textSecondary, margin: theme.spacing.xl }]}>No homes yet</Text></View>;
  return <View style={cardStyle} testID="profile-homes-data">{homesState.homes.map((home, index) => <View key={home.id}>{index > 0 ? <Divider theme={theme} /> : null}<SettingRow glyph="⌂" label={home.name} theme={theme} /></View>)}</View>;
}

function SettingsCard({ children, theme }: { children: React.ReactNode; theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.settingsCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card }]}>{children}</View>;
}

function SettingRow({ glyph, label, onPress, theme, trailing }: { glyph: string; label: string; onPress?: () => void; theme: ReturnType<typeof getTheme>; trailing?: React.ReactNode }) {
  const content = <><Text style={[styles.glyph, { color: theme.colors.textMuted }]}>{glyph}</Text><Text style={[theme.typography.body, styles.settingLabel, { color: theme.colors.textPrimary, marginLeft: theme.spacing.lg }]}>{label}</Text>{trailing ?? (onPress ? <Text style={[styles.chevron, { color: theme.colors.textSecondary }]}>›</Text> : null)}</>;
  if (onPress === undefined) return <View style={[styles.settingRow, { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xl }]}>{content}</View>;
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.75 : 1, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xl }]}>{content}</Pressable>;
}

function Divider({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

function ProfileDialog({ dialog, onClose, onConfirmLogout, onThemeSelected, theme, themePreference }: { dialog: Dialog; onClose: () => void; onConfirmLogout: () => void; onThemeSelected: (preference: ThemePreference) => void; theme: ReturnType<typeof getTheme>; themePreference: ThemePreference }) {
  if (dialog === null) return null;
  const { colors, radius, spacing, typography } = theme;
  const about = dialog === 'about';
  const themeMenu = dialog === 'theme';
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: colors.surface, borderRadius: radius.card, margin: spacing.xxl, padding: spacing.xxl }]}>{themeMenu ? <ThemeMenu onSelect={onThemeSelected} preference={themePreference} theme={theme} /> : <><Text style={[typography.h2, { color: colors.textPrimary }]}>{about ? 'About' : 'Logout'}</Text><Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>{about ? 'Smart Air v0.1.0\n\nIndoor air quality monitor and smart device controller.' : 'Are you sure you want to log out?'}</Text><View style={[styles.dialogActions, { marginTop: spacing.xxl }]}>{!about ? <Pressable accessibilityLabel="Cancel logout" accessibilityRole="button" onPress={onClose} style={{ padding: spacing.md }}><Text style={[typography.body, { color: colors.brand }]}>Cancel</Text></Pressable> : null}<Pressable accessibilityLabel={about ? 'Close about' : 'Confirm logout'} accessibilityRole="button" onPress={about ? onClose : onConfirmLogout} style={[styles.dialogPrimary, { backgroundColor: about ? colors.surface : colors.brand, borderRadius: radius.button, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }]}><Text style={[typography.body, { color: about ? colors.brand : colors.surface }]}>{about ? 'OK' : 'Logout'}</Text></Pressable></View></>}</View></View></Modal>;
}

function ThemeMenu({ onSelect, preference, theme }: { onSelect: (preference: ThemePreference) => void; preference: ThemePreference; theme: ReturnType<typeof getTheme> }) {
  return <><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginBottom: theme.spacing.md }]}>Theme</Text>{(['system', 'light', 'dark'] as const).map(option => <Pressable key={option} accessibilityLabel={`${titleCase(option)} theme`} accessibilityRole="button" onPress={() => onSelect(option)} style={[styles.themeOption, { paddingVertical: theme.spacing.lg }]}><Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>{titleCase(option)}</Text><Text style={[theme.typography.body, { color: theme.colors.brand }]}>{preference === option ? '✓' : ''}</Text></Pressable>)}</>;
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appBar: { alignItems: 'center', flexDirection: 'row', height: 56 },
  wordmark: { fontFamily: 'PlusJakartaSans', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  accountCard: { alignItems: 'center', borderWidth: 1, flexDirection: 'row' },
  avatar: { alignItems: 'center', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  accountCopy: { flex: 1 },
  edit: { padding: 8 },
  glyph: { fontSize: 20, width: 20 },
  settingsCard: { borderWidth: 1, overflow: 'hidden' },
  settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  settingLabel: { flex: 1 },
  chevron: { fontSize: 26, lineHeight: 26 },
  logout: { alignItems: 'center', borderWidth: 1.5, height: 52, justifyContent: 'center' },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', flex: 1, justifyContent: 'center' },
  dialog: { maxWidth: 420, width: '88%' },
  dialogActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' },
  dialogPrimary: { alignItems: 'center', justifyContent: 'center', minWidth: 74 },
  themeOption: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  divider: { height: 1 },
});
