import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';

export type StatusTone = 'accent' | 'danger' | 'neutral' | 'success' | 'warning';
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) { const { theme } = useAppTheme(); const colors = tone === 'success' ? [theme.colors.brandTint, theme.colors.brand] : tone === 'danger' ? [theme.colors.dangerTint, theme.colors.danger] : tone === 'warning' ? [theme.colors.warnTint, theme.colors.warn] : tone === 'accent' ? [theme.colors.accentTint, theme.colors.accent] : [theme.colors.surfaceVariant, theme.colors.textSecondary]; return <View style={[styles.badge, { backgroundColor: colors[0], borderRadius: theme.radius.pill }]}><Text style={[theme.typography.pill, { color: colors[1] }]}>{label}</Text></View>; }
const styles = StyleSheet.create({ badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5 } });
