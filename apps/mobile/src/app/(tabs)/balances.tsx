import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { MoneyInput } from '@/components/money-input';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { daysBetween, formatDay, STALE_DAYS, today } from '@/dates';
import { formatCop } from '@/money';
import { useTabBarClearance } from '@/navigation';
import { colors, light, type } from '@/theme/tokens';

export default function Balances() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });
  const clearance = useTabBarClearance();

  return (
    <QueryState
      query={accounts}
      errorTitle="No se pudieron cargar tus cuentas"
      emptyText="Todavía no tienes cuentas: créalas primero."
    >
      {(data) => (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
          keyboardShouldPersistTaps="handled"
        >
          {data.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </ScrollView>
      )}
    </QueryState>
  );
}

/** Cada tarjeta tiene su propio campo y su propia mutación: confirmar una no bloquea las demás. */
function AccountCard({ account }: { account: AccountSummary }) {
  const queryClient = useQueryClient();
  const [cents, setCents] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: (balanceCents: number) =>
      postJson<{ id: number }>(`/accounts/${account.id}/balances`, { asOf: today(), balanceCents }),
    onSuccess: () => {
      setCents(null);
      // La tarjeta muestra el saldo nuevo y la proyección se recalcula, sin actualizar nada a mano
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['projection'] });
    },
  });

  const submit = () => {
    if (cents === null) return setFormError('Escribe el saldo de hoy (con - si es sobregiro).');
    setFormError(null);
    confirm.mutate(cents);
  };

  const latest = account.latestBalance;
  const age = latest === null ? null : daysBetween(latest.asOf, today());
  // Sin ningún saldo también merece el aviso: la proyección no puede contar con esta cuenta
  const stale = age === null || age > STALE_DAYS;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>
          {account.name} ····{account.last4}
        </Text>
        {stale && <LightBadge light="yellow" label="Saldo viejo" />}
      </View>
      <Text style={[styles.muted, stale && styles.staleText]}>
        {latest === null
          ? 'Sin saldo todavía'
          : `Último saldo: ${formatCop(latest.balanceCents)} ${age === 0 ? 'hoy' : `al ${formatDay(latest.asOf)}`}`}
      </Text>

      <MoneyInput value={cents} onChangeCents={setCents} allowNegative placeholder="Saldo de hoy" />
      <Button label={confirm.isPending ? 'Confirmando…' : 'Confirmar'} loading={confirm.isPending} onPress={submit} />

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {confirm.isError && <Text style={styles.error}>{errorText(confirm.error)}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  card: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...type.subtitle, flexShrink: 1 },
  muted: { ...type.caption, color: colors.textMuted },
  staleText: { color: light.yellow.bg },
  error: { color: colors.danger },
});
