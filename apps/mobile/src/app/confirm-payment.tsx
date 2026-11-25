import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary, DebtPaymentResult } from '@/api/types';
import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { FormScreen } from '@/components/form-screen';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Pills } from '@/components/pills';
import { QueryState } from '@/components/query-state';
import { SelectCard } from '@/components/select-card';
import { Text } from '@/components/text';
import { formatDay, today } from '@/dates';
import { selectedAccountId } from '@/incomes/logic';
import { formatCop } from '@/money';
import {
  SHORTFALL_WARNING,
  confirmLabel,
  debtPaymentBody,
  excessNote,
  isDebt,
  parseConfirmTarget,
  recurringBody,
  splitPayment,
  validateConfirmation,
} from '@/payments/logic';
import { invalidatePayments } from '@/payments/invalidate';
import { MODE_HELP, MODE_ITEMS, type PaymentMode, type PaymentSource } from '@/products/payment';
import { colors, radius, space, type } from '@/theme/tokens';

const TITLE = {
  card: 'Pago de tarjeta',
  loan: 'Pago de la cuota',
  income: 'Llegó tu ingreso',
  fixed: 'Pago de gasto fijo',
} as const;

/**
 * Confirmar lo que de verdad pasó: cuándo, cuánto y de dónde. Un solo modal para los cuatro casos (tarjeta,
 * préstamo, ingreso y gasto fijo); lo que llega por la ruta dice cuál es. El monto viene prellenado con lo esperado
 * y se puede editar. En deudas, lo que pase del mínimo es un abono a capital y lo que falte se avisa.
 */
export default function ConfirmPayment() {
  const params = useLocalSearchParams();
  const target = parseConfirmTarget(params);
  // Una URL a mano o un enlace viejo sin los datos: no hay qué confirmar
  if (target === null) {
    return (
      <View style={styles.missing}>
        <Text style={styles.muted}>No se pudo abrir este pago. Vuelve a Próximos y elígelo de nuevo.</Text>
      </View>
    );
  }
  return <ConfirmForm target={target} />;
}

function ConfirmForm({ target }: { target: NonNullable<ReturnType<typeof parseConfirmTarget>> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const debt = isDebt(target.kind);

  const [amountCents, setAmountCents] = useState<number | null>(target.expectedCents);
  // Una tarjeta no se paga antes del corte: si el corte es de hoy o futuro, la fecha por defecto es hoy igual
  const [date, setDate] = useState(today());
  const [picked, setPicked] = useState<PaymentSource>(null);
  const [pickedAccount, setPickedAccount] = useState<number | null>(null);
  const [mode, setMode] = useState<PaymentMode>('reduce_term');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<DebtPaymentResult | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });
  const list = accounts.data ?? [];
  // Con una sola cuenta viene elegida; "Externo" nunca viene por defecto
  const only = list.length === 1 ? list[0] : undefined;
  const source: PaymentSource = picked ?? (only !== undefined ? { kind: 'account', id: only.id } : null);
  const accountId = selectedAccountId(list, pickedAccount);

  const { excess, shortfall } = splitPayment(amountCents ?? 0, target.expectedCents);
  const showSplit = debt && amountCents !== null && amountCents > 0;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const save = useMutation<DebtPaymentResult | { id: number }, Error, object>({
    mutationFn: (body: object) =>
      debt
        ? postJson<DebtPaymentResult>('/debt-payments', body)
        : postJson<{ id: number }>('/recurring-confirmations', body),
    onSuccess: (data) => {
      invalidatePayments(queryClient, target.kind === 'card' ? target.id : undefined);
      // Pagó menos del mínimo: se queda el aviso de mora hasta que la persona lo lea y cierre
      if (debt && 'shortfallCents' in data && data.shortfallCents > 0) return setResult(data);
      close();
    },
  });

  const submit = () => {
    const error = validateConfirmation({ target, amountCents, source, date, today: today() });
    if (error !== null) return setFormError(error);
    const body = debt
      ? debtPaymentBody({ target, paidDate: date, amountCents, source, mode })
      : recurringBody({ target, actualDate: date, amountCents, accountId });
    if (body === null) return setFormError('Revisa el monto y de dónde salió el dinero.');
    setFormError(null);
    save.mutate(body);
  };

  // Ya se guardó, pero faltó para el mínimo: se avisa antes de cerrar
  if (result !== null) {
    return (
      <FormScreen footer={<Button label="Entendido" onPress={close} />}>
        <Text style={type.title}>Pago guardado</Text>
        <Text style={styles.warning}>{SHORTFALL_WARNING}</Text>
        <Text style={styles.hint}>
          Faltaron {formatCop(result.shortfallCents)} para el mínimo. Los sumé al siguiente pago para que tu proyección
          no quede optimista.
        </Text>
      </FormScreen>
    );
  }

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {save.isError && <Text style={styles.error}>{errorText(save.error)}</Text>}
          <Button
            label={save.isPending ? 'Guardando…' : confirmLabel(target.kind)}
            loading={save.isPending}
            onPress={submit}
          />
        </>
      }
    >
      <Text style={styles.heroLabel}>{TITLE[target.kind]}</Text>
      <Text style={type.title}>{target.name}</Text>
      <Text style={styles.muted}>
        {target.kind === 'card' ? 'Corte' : 'Esperado'} del {formatDay(target.scheduledDate)}
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{target.kind === 'income' ? '¿Cuánto llegó?' : '¿Cuánto pagaste?'}</Text>
        <MoneyInput large value={amountCents} onChangeCents={setAmountCents} placeholder="$ 0" style={styles.amount} />
      </View>

      {/* Los atajos de una tarjeta: el mínimo o el total del extracto llenan el monto */}
      {target.kind === 'card' && target.fullPaymentCents !== undefined && (
        <View style={styles.chips}>
          <Chip
            label={`Mínimo ${formatCop(target.expectedCents)}`}
            active={amountCents === target.expectedCents}
            onPress={() => setAmountCents(target.expectedCents)}
          />
          <Chip
            label={`Total ${formatCop(target.fullPaymentCents)}`}
            active={amountCents === target.fullPaymentCents}
            onPress={() => setAmountCents(target.fullPaymentCents ?? null)}
          />
        </View>
      )}
      {target.kind === 'loan' && (
        <Text style={styles.hint}>La cuota de este mes es {formatCop(target.expectedCents)}.</Text>
      )}

      <Label>Fecha</Label>
      <DateField value={date} onChange={setDate} />

      <Label>
        {debt ? '¿De dónde salió el dinero?' : target.kind === 'income' ? 'A qué cuenta llegó' : 'De qué cuenta salió'}
      </Label>
      <QueryState inline query={accounts} errorTitle="No se pudieron cargar tus cuentas.">
        {(data) => (
          <View style={styles.cards}>
            {data.map((a) => (
              <SelectCard
                key={a.id}
                title={a.name}
                detail={`····${a.last4}`}
                selected={debt ? source?.kind === 'account' && source.id === a.id : a.id === accountId}
                onPress={() => (debt ? setPicked({ kind: 'account', id: a.id }) : setPickedAccount(a.id))}
              />
            ))}
            {debt && (
              <SelectCard
                title="Externo"
                detail="No pasa por tus cuentas"
                selected={source?.kind === 'external'}
                onPress={() => setPicked({ kind: 'external' })}
              />
            )}
          </View>
        )}
      </QueryState>

      {showSplit && excess > 0 && (
        <>
          <Text style={styles.note}>{excessNote(excess)}</Text>
          <Label>¿Qué quieres reducir con el abono?</Label>
          <Pills items={MODE_ITEMS} selected={mode} onSelect={setMode} />
          <Text style={styles.hint}>{MODE_HELP[mode]}</Text>
        </>
      )}
      {showSplit && shortfall > 0 && <Text style={styles.warning}>{SHORTFALL_WARNING}</Text>}
    </FormScreen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={active ? styles.chipTextActive : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, padding: space.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  heroLabel: { ...type.caption, color: colors.textMuted },
  amount: { textAlign: 'center', alignSelf: 'stretch' },
  hint: { color: colors.textMuted, fontSize: 13 },
  muted: { ...type.caption, color: colors.textMuted },
  note: { ...type.bodyMedium, color: colors.primary },
  warning: { ...type.bodyMedium, color: colors.danger },
  error: { color: colors.danger },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.bodyMedium },
  chipTextActive: { ...type.bodyMedium, color: colors.onPrimary },
});
