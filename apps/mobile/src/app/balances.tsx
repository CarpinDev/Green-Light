import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary } from '@/api/types';
import { daysBetween, formatDay, STALE_DAYS, today } from '@/dates';
import { formatCop, parseSignedPesos } from '@/money';

export default function Balances() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });

  if (accounts.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
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

      <TextInput
        style={styles.input}
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
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: '#2e9e5b',
    padding: 16,
    gap: 8,
  },
  cardStale: { borderLeftColor: '#e0a800', backgroundColor: '#fff4d6' },
  name: { fontSize: 18, fontWeight: '700' },
  muted: { color: '#666', fontSize: 14 },
  staleText: { color: '#7a5a00', fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  button: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#d64545' },
});
