import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../design/ThemeProvider';
import { useSessionStore } from '../../state/sessionStore';
import type { AuthStackParamList } from '../../navigation/types';
import { AuthField } from './AuthField';
import { AuthLayout } from './AuthLayout';
import { AuthPrimaryButton } from './AuthPrimaryButton';
import { validateRegister, type AuthValidationErrors } from './authValidation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { theme } = useAppTheme();
  const register = useSessionStore(state => state.register);
  const status = useSessionStore(state => state.status);
  const error = useSessionStore(state => state.error);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState<AuthValidationErrors>({});

  const submit = async () => {
    const errors = validateRegister(fullName, email.trim(), password);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      await register({ full_name: fullName.trim(), email: email.trim(), password });
    } catch {
      // The store retains the response error for display.
    }
  };

  const { colors, spacing, typography } = theme;
  return (
    <AuthLayout theme={theme} title="Create Account" subtitle="Join Smart Air to monitor your indoor air quality">
      <AuthField autoComplete="name" label="Full Name" onChangeText={setFullName} theme={theme} value={fullName} error={validation.fullName} />
      <View style={{ height: spacing.xxl }} />
      <AuthField autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} theme={theme} value={email} error={validation.email} />
      <View style={{ height: spacing.xxl }} />
      <AuthField autoComplete="password" label="Password" onChangeText={setPassword} secureTextEntry theme={theme} value={password} error={validation.password} />
      {error ? <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger, marginTop: spacing.xl }]}>{error.message}</Text> : null}
      <AuthPrimaryButton label="Create Account" loading={status === 'authenticating'} onPress={() => { submit().catch(() => undefined); }} theme={theme} />
      <View style={[styles.accountRow, { marginTop: spacing.xxl }]}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Already have an account? </Text>
        <Pressable accessibilityLabel="Sign In" accessibilityRole="button" onPress={() => navigation.goBack()}>
          <Text style={[typography.body, styles.link, { color: colors.brand }]}>Sign In</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  accountRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
});
