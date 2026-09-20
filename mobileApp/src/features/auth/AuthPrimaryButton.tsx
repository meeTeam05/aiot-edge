import type { GestureResponderEvent } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { AtmosphereTheme } from '../../design/theme';

interface AuthPrimaryButtonProps {
  label: string;
  loading: boolean;
  onPress: (event: GestureResponderEvent) => void;
  theme: AtmosphereTheme;
}

export function AuthPrimaryButton({ label, loading, onPress, theme }: AuthPrimaryButtonProps) {
  const { colors, radius, spacing, typography } = theme;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.brand,
          borderRadius: radius.button,
          marginTop: spacing.huge,
          opacity: loading || pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={[typography.body, { color: colors.surface }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', height: 52, justifyContent: 'center' },
});
