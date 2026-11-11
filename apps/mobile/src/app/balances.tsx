import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary } from '@/api/types';
import { Input } from '@/components/input';
import { Text } from '@/components/text';
import { daysBetween, formatDay, STALE_DAYS, today } from '@/dates';
import { formatCop, parseSignedPesos } from '@/money';
import { colors, light, radius, type } from '@/theme/tokens';

export default function Balances() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });

  if (accounts.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (accounts.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>No se pudieron cargar tus cuentas</Text>
        <Text style={styles.muted}>{errorText(accounts.error)}</Text>
        <Pressable onPress={() => void accounts.refetch()} style={styles.button}>
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {accounts.data.length === 0 ? (
        <Text style={styles.muted}>Todavía no tienes cuentas: créalas primero.</Text>
      ) : (
        accounts.data.map((account) => <AccountCard key={account.id} account={account} />)
      )}
    </ScrollView>
  );
}

/** Cada tarjeta tiene su propio campo y su propia mutación: confirmar una no bloquea las demás. */
function AccountCard({ account }: { account: AccountSummary }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: (balanceCents: number) =>
      postJson<{ id: number }>(`/accounts/${account.id}/balances`, { asOf: today(), balanceCents }),
    onSuccess: () => {
      setAmount('');
      // La tarjeta muestra el saldo nuevo y la proyección se recalcula, sin actualizar nada a mano
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['projection'] });
    },
  });

  const submit = () => {
    const balanceCents = parseSignedPesos(amount);
    if (balanceCents === null) return setFormError('Escribe el saldo en pesos, solo números (con - si es sobregiro).');
    setFormError(null);
    confirm.mutate(balanceCents);
  };

  const latest = account.latestBalance;
  const age = latest === null ? null : daysBetween(latest.asOf, today());
  // Sin ningún saldo también merece el aviso: la proyección no puede contar con esta cuenta
  const stale = age === null || age > STALE_DAYS;

  return (
    <View style={[styles.card, stale && styles.cardStale]}>
      <Text style={styles.name}>
        {account.name} ····{account.last4}
      </Text>
      <Text style={stale ? styles.staleText : styles.muted}>
        {latest === null
          ? 'Sin saldo todavía'
          : `Último saldo: ${formatCop(latest.balanceCents)} ${age === 0 ? 'hoy' : `al ${formatDay(latest.asOf)}`}`}
      </Text>

      <Input
        value={amount}
        onChangeText={setAmount}
        placeholder="Saldo de hoy (ej. 1.500.000)"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />
      <Pressable
        onPress={submit}
        disabled={confirm.isPending}
        style={[styles.button, confirm.isPending && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{confirm.isPending ? 'Confirmando…' : 'Confirmar'}</Text>
      </Pressable>

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {confirm.isError && <Text style={styles.error}>{errorText(confirm.error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderLeftWidth: 6,
    borderLeftColor: light.green.bg,
    padding: 16,
    gap: 8,
  },
  cardStale: { borderLeftColor: light.yellow.bg },
  name: { ...type.subtitle },
  muted: { ...type.caption, color: colors.textMuted },
  staleText: { ...type.caption, color: light.yellow.bg },
  errorTitle: { ...type.subtitle },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onPrimary, fontWeight: '600' },
  error: { color: light.red.bg },
});
