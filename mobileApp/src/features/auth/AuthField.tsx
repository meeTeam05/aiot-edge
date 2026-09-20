import type { KeyboardTypeOptions } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { AtmosphereTheme } from '../../design/theme';

interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: AtmosphereTheme;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: 'email' | 'name' | 'password';
}

export function AuthField({
  label,
  value,
  onChangeText,
  theme,
  error,
  secureTextEntry = false,
  keyboardType,
  autoComplete,
}: AuthFieldProps) {
  const { colors, radius, spacing, typography } = theme;
  return (
    <View>
      <Text style={[typography.body, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.input,
            marginTop: spacing.md,
            paddingHorizontal: spacing.xl,
          },
        ]}
        value={value}
      />
      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, height: 56, paddingVertical: 0 },
});
