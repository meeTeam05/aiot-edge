import { StyleSheet, View, type ViewProps } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';

export function Card({ children, style, ...props }: ViewProps) {
  const { theme } = useAppTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.card, padding: theme.spacing.xl }, style]}>{children}</View>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1 } });
