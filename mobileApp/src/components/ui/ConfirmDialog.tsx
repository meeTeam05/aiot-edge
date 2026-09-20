import { Modal, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';
import { PrimaryButton, SecondaryButton } from './Button';

export function ConfirmDialog({ cancelLabel = 'Cancel', confirmLabel = 'Confirm', destructive = false, message, onCancel, onConfirm, title, visible }: { cancelLabel?: string; confirmLabel?: string; destructive?: boolean; message: string; onCancel: () => void; onConfirm: () => void; title: string; visible: boolean }) {
  const { theme } = useAppTheme();
  return <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: theme.spacing.xxl }]}><Text style={[theme.typography.h2, { color: theme.colors.textPrimary }]}>{title}</Text><Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>{message}</Text><View style={[styles.actions, { marginTop: theme.spacing.xxl }]}><SecondaryButton label={cancelLabel} onPress={onCancel} /><View style={[styles.confirmAction, { marginLeft: theme.spacing.md }]}><PrimaryButton label={confirmLabel} onPress={onConfirm} /></View></View>{destructive ? <Text accessibilityElementsHidden style={[styles.hidden, { color: theme.colors.danger }]}>Destructive action</Text> : null}</View></View></Modal>;
}

const styles = StyleSheet.create({ overlay: { alignItems: 'center', backgroundColor: '#00000066', flex: 1, justifyContent: 'center', padding: 20 }, dialog: { width: '100%' }, actions: { flexDirection: 'row' }, confirmAction: { flex: 1 }, hidden: { height: 0 } });
