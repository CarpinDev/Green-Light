import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { Text } from '@/components/text';
import { useAuth } from '@/auth/auth-provider';
import { MIN_PASSWORD_LENGTH, authErrorText, validateRegister } from '@/auth/forms';
import { colors, type } from '@/theme/tokens';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => signUp({ name: name.trim(), email: email.trim(), password, inviteCode: inviteCode.trim() }),
  });

  const submit = () => {
    const error = validateRegister({ name, email, password, inviteCode });
    if (error !== null) return setFormError(error);
    setFormError(null);
    register.mutate();
  };

  const error = formError ?? (register.isError ? authErrorText(register.error) : null);

  return (
    <AuthScreen title="Crea tu cuenta" switchText="¿Ya tienes cuenta?" switchLabel="Inicia sesión" switchHref="/login">
      <Label>Nombre</Label>
      <Input
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        accessibilityLabel="Nombre"
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Contraseña"
      />
      <Text style={styles.hint}>Al menos {MIN_PASSWORD_LENGTH} caracteres.</Text>
      <Label>Código de invitación</Label>
      <Input
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Código de invitación"
        onSubmitEditing={submit}
        returnKeyType="go"
      />
      {error !== null && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Button label={register.isPending ? 'Creando…' : 'Crear cuenta'} loading={register.isPending} onPress={submit} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.caption, color: colors.textMuted },
  error: { color: colors.danger },
});
