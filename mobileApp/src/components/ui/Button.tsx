import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';

interface ButtonProps extends Omit<PressableProps, 'style'> { label: string; loading?: boolean; }

export function PrimaryButton({ disabled, label, loading = false, ...props }: ButtonProps) {
  const { theme } = useAppTheme();
  const inactive = disabled || loading;
  return <Pressable {...props} accessibilityRole="button" disabled={inactive} style={({ pressed }) => [styles.button, { backgroundColor: theme.colors.brand, borderRadius: theme.radius.button, opacity: inactive ? 0.55 : pressed ? 0.82 : 1 }]}>{loading ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={[theme.typography.body, { color: theme.colors.surface }]}>{label}</Text>}</Pressable>;
}

export function SecondaryButton({ disabled, label, loading = false, ...props }: ButtonProps) {
  const { theme } = useAppTheme();
  const inactive = disabled || loading;
  return <Pressable {...props} accessibilityRole="button" disabled={inactive} style={({ pressed }) => [styles.button, { borderColor: theme.colors.border, borderRadius: theme.radius.button, borderWidth: 1, opacity: inactive ? 0.55 : pressed ? 0.72 : 1 }]}>{loading ? <ActivityIndicator color={theme.colors.brand} /> : <Text style={[theme.typography.body, { color: theme.colors.brand }]}>{label}</Text>}</Pressable>;
}

const styles = StyleSheet.create({ button: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 20 } });
