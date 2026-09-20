import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';
import { useLogin } from '../../hooks/useLogin';
import type { AuthStackParamList } from '../../navigation/types';
import { AuthField } from './AuthField';
import { AuthLayout } from './AuthLayout';
import { AuthPrimaryButton } from './AuthPrimaryButton';
import { validateLogin, type AuthValidationErrors } from './authValidation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const { login, error, isLoading } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState<AuthValidationErrors>({});

  const submit = async () => {
    const errors = validateLogin(email.trim(), password);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      await login({ email: email.trim(), password });
    } catch {
      // The session store exposes the server or network message below.
    }
  };

  const { colors, spacing, typography } = theme;
  return (
    <AuthLayout theme={theme} title="Welcome back" subtitle="Sign in to continue">
      <AuthField autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} theme={theme} value={email} error={validation.email} />
      <View style={{ height: spacing.xxl }} />
      <AuthField autoComplete="password" label="Password" onChangeText={setPassword} secureTextEntry theme={theme} value={password} error={validation.password} />
      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, marginTop: spacing.xl }]}>{error.message}</Text> : null}
      <AuthPrimaryButton label="Sign In" loading={isLoading} onPress={() => { submit().catch(() => undefined); }} theme={theme} />
      <Pressable
        accessibilityLabel="Forgot password"
        accessibilityRole="button"
        onPress={() => Alert.alert('Coming soon')}
        style={[styles.forgotPassword, { marginTop: spacing.xxl }]}
      >
        <Text style={[typography.body, styles.link, { color: colors.brand }]}>Forgot password?</Text>
      </Pressable>
      <View style={[styles.accountRow, { marginTop: spacing.xxl }]}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>No account? </Text>
        <Pressable accessibilityLabel="Register" accessibilityRole="button" onPress={() => navigation.navigate('Register')}>
          <Text style={[typography.body, styles.link, { color: colors.brand }]}>Register</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  accountRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  forgotPassword: { alignSelf: 'center' },
  link: { textDecorationLine: 'underline' },
});
