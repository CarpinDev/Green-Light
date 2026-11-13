import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Text } from '@/components/text';
import { useAuth } from '@/auth/auth-provider';
import { authErrorText, validateLogin } from '@/auth/forms';
import { colors } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Al entrar, el guard del layout cambia de grupo de pantallas solo: no hace falta navegar
  const login = useMutation({ mutationFn: () => signIn(email.trim(), password) });

  const submit = () => {
    const error = validateLogin({ email, password });
    if (error !== null) return setFormError(error);
    setFormError(null);
    login.mutate();
  };

  const error = formError ?? (login.isError ? authErrorText(login.error) : null);

  return (
    <AuthScreen title="Inicia sesión" switchText="¿No tienes cuenta?" switchLabel="Regístrate" switchHref="/register">
      <Label>Email</Label>
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="tu@email.com"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Email"
      />
      <Label>Contraseña</Label>
      <Input
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Contraseña"
        onSubmitEditing={submit}
        returnKeyType="go"
      />
      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button label={login.isPending ? 'Entrando…' : 'Entrar'} loading={login.isPending} onPress={submit} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger },
});
