import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { MoneyInput } from '@/components/money-input';
import { Text } from '@/components/text';
import { daysBetween, formatDay, STALE_DAYS, today } from '@/dates';
import { formatCop } from '@/money';
import { colors, light, type } from '@/theme/tokens';

/** Una cuenta y su campo para confirmar el saldo de hoy. Cada una tiene su propia mutación: confirmar una no bloquea las demás. */
export function BalanceCard({ account }: { account: AccountSummary }) {
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
        <Link href={{ pathname: '/accounts/[id]', params: { id: String(account.id) } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Opciones de ${account.name}`} hitSlop={8}>
            <Text style={styles.options}>Opciones</Text>
          </Pressable>
        </Link>
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
  card: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...type.subtitle, flexShrink: 1 },
  options: { ...type.caption, color: colors.primary, fontWeight: '700' },
  muted: { ...type.caption, color: colors.textMuted },
  staleText: { color: light.yellow.bg },
  error: { color: colors.danger },
});
