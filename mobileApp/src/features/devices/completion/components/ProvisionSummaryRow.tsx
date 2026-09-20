import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../../../design/ThemeProvider';

export function ProvisionSummaryRow({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();
  return <View style={[styles.row, { borderBottomColor: theme.colors.border }]}><Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text><Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({ row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 } });
