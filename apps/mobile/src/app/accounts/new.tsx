import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountType } from '@/api/types';
import { Button } from '@/components/button';
import { ChoiceButtons } from '@/components/choice-buttons';
import { FormScreen } from '@/components/form-screen';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { isLast4, sanitizeLast4 } from '@/products/logic';
import { invalidateProducts } from '@/products/invalidate';
import { colors } from '@/theme/tokens';

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'savings', label: 'Ahorros' },
  { value: 'checking', label: 'Corriente' },
];

export default function NewAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [last4, setLast4] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('savings');
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>('/accounts', body),
    onSuccess: () => {
      invalidateProducts(queryClient);
      if (router.canGoBack()) router.back();
      else router.replace('/products');
    },
  });

  const submit = () => {
    if (name.trim() === '') return setFormError('Ponle un nombre a la cuenta (ej. Ahorros).');
    if (bank.trim() === '') return setFormError('Escribe el banco.');
    if (!isLast4(last4)) return setFormError('Escribe los últimos 4 dígitos de la cuenta.');

    setFormError(null);
    create.mutate({
      name: name.trim(),
      bank: bank.trim(),
      last4,
      accountType,
      // El saldo y su fecha van juntos. Puede ser negativo (sobregiro)
      ...(balanceCents !== null && { openingBalanceCents: balanceCents, asOf: today() }),
    });
  };

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
          <Button label={create.isPending ? 'Creando…' : 'Crear cuenta'} loading={create.isPending} onPress={submit} />
        </>
      }
    >
      <Label>Nombre</Label>
      <Input value={name} onChangeText={setName} placeholder="Ahorros" />

      <Label>Banco</Label>
      <Input value={bank} onChangeText={setBank} placeholder="Bancolombia" />

      <Label>Últimos 4 dígitos</Label>
      <Input
        value={last4}
        onChangeText={(text) => setLast4(sanitizeLast4(text))}
        placeholder="1234"
        keyboardType="number-pad"
        maxLength={4}
      />
      <Text style={styles.hint}>Solo los últimos 4 dígitos, nunca el número completo.</Text>

      <Label>Tipo de cuenta</Label>
      <ChoiceButtons items={TYPES} selected={accountType} onSelect={setAccountType} />

      <Label>Saldo actual (opcional)</Label>
      <MoneyInput value={balanceCents} onChangeCents={setBalanceCents} allowNegative placeholder="$ 0" />
      <Text style={styles.hint}>
        Si está en sobregiro, escribe el signo menos primero (-50.000). Se guarda con la fecha de hoy.
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger },
});
