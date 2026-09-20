import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';
import { PrimaryButton } from './Button';
import { AppIcon } from './icons';

export function LoadingState({ message = 'Loading…', testID }: { message?: string; testID?: string }) { const { theme } = useAppTheme(); return <View style={styles.state} testID={testID}><ActivityIndicator color={theme.colors.brand} size="large" /><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>{message}</Text></View>; }
export function EmptyState({ actionLabel, body, onAction, testID, title }: { actionLabel?: string; body: string; onAction?: () => void; testID?: string; title: string }) { const { theme } = useAppTheme(); return <View style={styles.state} testID={testID}><AppIcon color={theme.colors.textSecondary} name="device" size={28} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.lg }]}>{title}</Text><Text style={[theme.typography.body, styles.copy, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{body}</Text>{actionLabel && onAction ? <View style={{ marginTop: theme.spacing.xxl }}><PrimaryButton label={actionLabel} onPress={onAction} /></View> : null}</View>; }
export function ErrorState({ error, onRetry, testID, title = 'Something went wrong' }: { error?: string; onRetry?: () => void; testID?: string; title?: string }) { const { theme } = useAppTheme(); return <View style={styles.state} testID={testID}><AppIcon color={theme.colors.warn} name="warning" size={28} /><Text style={[theme.typography.h2, { color: theme.colors.textPrimary, marginTop: theme.spacing.lg }]}>{title}</Text>{error ? <Text style={[theme.typography.body, styles.copy, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>{error}</Text> : null}{onRetry ? <View style={{ marginTop: theme.spacing.xxl }}><PrimaryButton label="Retry" onPress={onRetry} /></View> : null}</View>; }

const styles = StyleSheet.create({ state: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24 }, copy: { textAlign: 'center' } });
