import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { FormScreen } from '@/components/form-screen';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Pills } from '@/components/pills';
import { QueryState } from '@/components/query-state';
import { SelectCard } from '@/components/select-card';
import { Text } from '@/components/text';
import { isValidDate, today } from '@/dates';
import { invalidateProducts } from '@/products/invalidate';
import { MODE_HELP, MODE_ITEMS, type PaymentMode, type PaymentSource, paymentBody } from '@/products/payment';
import { validatePayment } from '@/products/payment';
import { colors, space, type } from '@/theme/tokens';

/** Abonar a la deuda de una tarjeta: cuánto, cuándo, de dónde sale el dinero y qué quieres reducir. */
export default function CardPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [picked, setPicked] = useState<PaymentSource>(null);
  const [mode, setMode] = useState<PaymentMode>('reduce_term');
  const [formError, setFormError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });
  const list = accounts.data ?? [];
  // Con una sola cuenta viene elegida; "Externo" nunca viene por defecto
  const only = list.length === 1 ? list[0] : undefined;
  const source: PaymentSource = picked ?? (only !== undefined ? { kind: 'account', id: only.id } : null);

  const create = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>('/capital-payments', body),
    onSuccess: () => {
      // El abono cambia el plan, la lista de abonos, la proyección, los movimientos y (si sale de una cuenta) el saldo
      invalidateProducts(queryClient);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/cards/[id]', params: { id: String(cardId) } });
    },
  });

  const submit = () => {
    const error = validatePayment({ amountCents, source });
    if (error !== null) return setFormError(error);
    if (!isValidDate(date)) return setFormError('Elige una fecha válida.');

    const body = paymentBody({ cardId, amountCents, source, date, mode });
    if (body === null) return setFormError('Revisa el monto y de dónde sale el dinero.');
    setFormError(null);
    create.mutate(body);
  };

  const isExternal = source?.kind === 'external';

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {/* La API valida contra la deuda abonable y su mensaje dice hasta cuánto se puede */}
          {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
          <Button label={create.isPending ? 'Abonando…' : 'Abonar'} loading={create.isPending} onPress={submit} />
        </>
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>¿Cuánto vas a abonar?</Text>
        <MoneyInput large value={amountCents} onChangeCents={setAmountCents} placeholder="$ 0" style={styles.amount} />
      </View>

      <Text style={styles.hint}>
        Solo se puede abonar lo que todavía no está facturado. El abono se reparte solo, primero a la compra de mayor
        tasa.
      </Text>

      <Label>Fecha</Label>
      <DateField value={date} onChange={setDate} />

      <Label>¿De dónde sale el dinero?</Label>
      <QueryState inline query={accounts} errorTitle="No se pudieron cargar tus cuentas.">
        {(data) => (
          <View style={styles.cards}>
            {data.map((a) => (
              <SelectCard
                key={a.id}
                title={a.name}
                detail={`····${a.last4}`}
                selected={source?.kind === 'account' && source.id === a.id}
                onPress={() => setPicked({ kind: 'account', id: a.id })}
              />
            ))}
            <SelectCard
              title="Externo"
              detail="No pasa por tus cuentas"
              selected={isExternal}
              onPress={() => setPicked({ kind: 'external' })}
            />
          </View>
        )}
      </QueryState>
      {accounts.data?.length === 0 && (
        <Card style={styles.empty}>
          <Text style={styles.muted}>Aún no tienes cuentas. Puedes abonar con dinero externo o crear una cuenta.</Text>
          <Link href="/accounts/new" asChild>
            <Button label="Agregar cuenta" variant="secondary" />
          </Link>
        </Card>
      )}
      <Text style={styles.hint}>
        Externo es dinero que no pasa por tus cuentas (por ejemplo, un ingreso extra que va directo a la tarjeta). Baja
        tu deuda pero no cambia tu saldo.
      </Text>

      <Label>¿Qué quieres reducir?</Label>
      <Pills items={MODE_ITEMS} selected={mode} onSelect={setMode} />
      <Text style={styles.hint}>{MODE_HELP[mode]}</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  heroLabel: { ...type.caption, color: colors.textMuted },
  amount: { textAlign: 'center', alignSelf: 'stretch' },
  hint: { color: colors.textMuted, fontSize: 13 },
  muted: { ...type.caption, color: colors.textMuted },
  empty: { gap: space.md },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  error: { color: colors.danger },
});
