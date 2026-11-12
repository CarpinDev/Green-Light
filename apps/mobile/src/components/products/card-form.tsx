import { Feather } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { patchJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { CardSummary, FirstPeriodInterest, MinPaymentMethod } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceButtons } from '@/components/choice-buttons';
import { FormScreen } from '@/components/form-screen';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Pills } from '@/components/pills';
import { RateField } from '@/components/products/rate-field';
import { RateUpdate } from '@/components/products/rate-update';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { formatCop } from '@/money';
import { parseDay, parseInstallments, sanitizeLast4, isLast4 } from '@/products/logic';
import { invalidateProducts } from '@/products/invalidate';
import { FIRST_PERIOD_INTERESTS, helpOf, PAYMENT_METHODS, SINGLE_INSTALLMENT_HELP } from '@/products/options';
import { percentToFraction, type RateKind } from '@/products/rates';
import { colors, space, type } from '@/theme/tokens';

const YES_NO = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

/** La deuda que la tarjeta ya traía al empezar a usar la app: lo que se debe y cuántas cuotas faltan. */
interface OpeningDebt {
  amountCents: number;
  installments: number;
}

/** Crear una tarjeta (sin `card`) o editarla (con `card`). Banco y últimos 4 son su identidad: no se editan. */
export function CardForm({ card }: { card?: CardSummary }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editing = card !== undefined;

  const [name, setName] = useState(card?.name ?? '');
  const [bank, setBank] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState<number | null>(card?.creditLimitCents ?? null);
  const [cutDay, setCutDay] = useState(card === undefined ? '' : String(card.cutDay));
  const [dueDay, setDueDay] = useState(card === undefined ? '' : String(card.dueDay));
  const [percent, setPercent] = useState('');
  const [rateKind, setRateKind] = useState<RateKind>('ea');
  const [handling, setHandling] = useState<number | null>(card?.handlingFeeCents ?? null);
  const [insurance, setInsurance] = useState<number | null>(card?.insuranceCents ?? null);
  const [method, setMethod] = useState<MinPaymentMethod>(card?.minPaymentMethod ?? 'constant_capital');
  const [singleFree, setSingleFree] = useState(card?.singleInstallmentInterestFree ?? true);
  const [firstPeriod, setFirstPeriod] = useState<FirstPeriodInterest>(card?.firstPeriodInterest ?? 'prorated');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);
  const [debtAmount, setDebtAmount] = useState<number | null>(null);
  const [debtInstallments, setDebtInstallments] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Crear la tarjeta y registrar su deuda son dos llamadas: si la segunda falla, la tarjeta ya existe.
  // Se guarda su id y la deuda para poder reintentar solo la deuda, sin crear la tarjeta otra vez.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [debt, setDebt] = useState<OpeningDebt | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/products');
  };

  const saveCard = useMutation({
    mutationFn: (body: object) =>
      editing ? patchJson<{ id: number }>(`/cards/${card.id}`, body) : postJson<{ id: number }>('/cards', body),
    onSuccess: ({ id }) => {
      invalidateProducts(queryClient);
      if (editing || debt === null) return close();
      setCreatedId(id);
      saveDebt.mutate({ cardId: id, debt });
    },
  });

  const saveDebt = useMutation({
    mutationFn: ({ cardId, debt: d }: { cardId: number; debt: OpeningDebt }) =>
      postJson<{ id: number }>('/expenses', {
        date: today(),
        amountCents: d.amountCents,
        sourceProductId: cardId,
        installments: d.installments,
        isOpeningDebt: true,
      }),
    onSuccess: () => {
      invalidateProducts(queryClient);
      close();
    },
  });

  const submit = () => {
    const cut = parseDay(cutDay);
    const due = parseDay(dueDay);
    if (name.trim() === '') return setFormError('Ponle un nombre a la tarjeta (ej. Visa).');
    if (!editing && bank.trim() === '') return setFormError('Escribe el banco.');
    if (!editing && !isLast4(last4)) return setFormError('Escribe los últimos 4 dígitos de la tarjeta.');
    if (limit === null || limit === 0) return setFormError('Escribe el cupo de la tarjeta.');
    if (cut === null) return setFormError('El día de corte va de 1 a 31.');
    if (due === null) return setFormError('El día de pago va de 1 a 31.');

    if (editing) {
      setFormError(null);
      // Solo lo que cambió; el cargo vacío cuenta como 0 (sin cargo)
      const changes = {
        ...(name.trim() !== card.name && { name: name.trim() }),
        ...(limit !== card.creditLimitCents && { creditLimitCents: limit }),
        ...(cut !== card.cutDay && { cutDay: cut }),
        ...(due !== card.dueDay && { dueDay: due }),
        ...((handling ?? 0) !== card.handlingFeeCents && { handlingFeeCents: handling ?? 0 }),
        ...((insurance ?? 0) !== card.insuranceCents && { insuranceCents: insurance ?? 0 }),
        ...(method !== card.minPaymentMethod && { minPaymentMethod: method }),
        ...(singleFree !== card.singleInstallmentInterestFree && { singleInstallmentInterestFree: singleFree }),
        ...(firstPeriod !== card.firstPeriodInterest && { firstPeriodInterest: firstPeriod }),
      };
      if (Object.keys(changes).length === 0) return close();
      saveCard.mutate(changes);
      return;
    }

    const fraction = percentToFraction(percent);
    if (fraction === null) return setFormError('Escribe la tasa como porcentaje menor a 100, por ejemplo 28,99.');

    let opening: OpeningDebt | null = null;
    if (hasDebt) {
      const installments = parseInstallments(debtInstallments);
      if (debtAmount === null || debtAmount === 0) return setFormError('Escribe cuánto debes en la tarjeta.');
      if (installments === null) return setFormError('Las cuotas que te faltan van de 1 a 72.');
      opening = { amountCents: debtAmount, installments };
    }

    setFormError(null);
    setDebt(opening);
    saveCard.mutate({
      name: name.trim(),
      bank: bank.trim(),
      last4,
      creditLimitCents: limit,
      cutDay: cut,
      dueDay: due,
      rate: { effectiveFrom: today(), [rateKind]: fraction },
      ...((handling ?? 0) > 0 && { handlingFeeCents: handling }),
      ...((insurance ?? 0) > 0 && { insuranceCents: insurance }),
      minPaymentMethod: method,
      singleInstallmentInterestFree: singleFree,
      firstPeriodInterest: firstPeriod,
    });
  };

  // La tarjeta ya quedó creada pero la deuda falló: solo queda reintentar la deuda
  if (createdId !== null && debt !== null) {
    return (
      <FormScreen
        footer={
          <>
            {saveDebt.isError && <Text style={styles.error}>{errorText(saveDebt.error)}</Text>}
            <Button
              label={saveDebt.isPending ? 'Registrando…' : 'Reintentar la deuda'}
              loading={saveDebt.isPending}
              onPress={() => saveDebt.mutate({ cardId: createdId, debt })}
            />
            <Button label="Omitir la deuda" variant="secondary" disabled={saveDebt.isPending} onPress={close} />
          </>
        }
      >
        <Card style={styles.recovery}>
          <Text style={type.subtitle}>La tarjeta ya quedó creada</Text>
          <Text style={styles.muted}>
            {saveDebt.isPending
              ? 'Registrando la deuda…'
              : `Pero no se pudo registrar la deuda de ${formatCop(debt.amountCents)} a ${debt.installments} cuotas. Puedes reintentarla sin crear la tarjeta otra vez, o agregarla después desde un gasto con esa tarjeta.`}
          </Text>
        </Card>
      </FormScreen>
    );
  }

  const busy = saveCard.isPending || saveDebt.isPending;
  const submitLabel = busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear tarjeta';

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {saveCard.isError && <Text style={styles.error}>{errorText(saveCard.error)}</Text>}
          <Button label={submitLabel} loading={busy} onPress={submit} />
        </>
      }
    >
      <Label>Nombre</Label>
      <Input value={name} onChangeText={setName} placeholder="Visa" />

      {editing ? (
        <>
          <Label>Banco y últimos 4 dígitos</Label>
          <Text style={styles.fixed}>
            {card.bank} ····{card.last4}
          </Text>
          <Text style={styles.hint}>Son la identidad de la tarjeta: si cambian, es otra tarjeta.</Text>
        </>
      ) : (
        <>
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
        </>
      )}

      <Label>Cupo</Label>
      <MoneyInput value={limit} onChangeCents={setLimit} placeholder="$ 0" />

      <Label>Día de corte (1 a 31)</Label>
      <Input value={cutDay} onChangeText={setCutDay} placeholder="15" keyboardType="number-pad" maxLength={2} />
      <Text style={styles.hint}>El día en que el banco cierra tu extracto.</Text>

      <Label>Día de pago (1 a 31)</Label>
      <Input value={dueDay} onChangeText={setDueDay} placeholder="5" keyboardType="number-pad" maxLength={2} />
      <Text style={styles.hint}>El último día para pagar sin que te cobren mora.</Text>

      {!editing && (
        <>
          <Label>Tasa de interés</Label>
          <RateField percent={percent} onChangePercent={setPercent} kind={rateKind} onChangeKind={setRateKind} />
        </>
      )}

      <Label>Cuota de manejo mensual (opcional)</Label>
      <MoneyInput value={handling} onChangeCents={setHandling} placeholder="$ 0" />

      <Label>Seguro mensual (opcional)</Label>
      <MoneyInput value={insurance} onChangeCents={setInsurance} placeholder="$ 0" />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        onPress={() => setAdvancedOpen((v) => !v)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>Opciones avanzadas</Text>
        <Feather name={advancedOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {advancedOpen && (
        <Card style={styles.advanced}>
          <Text style={styles.muted}>
            Los valores de siempre ya vienen puestos: cámbialos solo si tu banco lo hace distinto.
          </Text>

          <Label>Cómo se calcula el pago mínimo</Label>
          <Pills
            items={PAYMENT_METHODS.map((o) => ({ value: o.value, label: o.label }))}
            selected={method}
            onSelect={setMethod}
          />
          <Text style={styles.hint}>{helpOf(PAYMENT_METHODS, method)}</Text>

          <Label>Compras a 1 cuota sin interés</Label>
          <ChoiceButtons
            items={YES_NO}
            selected={singleFree ? 'yes' : 'no'}
            onSelect={(v) => setSingleFree(v === 'yes')}
          />
          <Text style={styles.hint}>{SINGLE_INSTALLMENT_HELP}</Text>

          <Label>Interés de la primera cuota</Label>
          <Pills
            items={FIRST_PERIOD_INTERESTS.map((o) => ({ value: o.value, label: o.label }))}
            selected={firstPeriod}
            onSelect={setFirstPeriod}
          />
          <Text style={styles.hint}>{helpOf(FIRST_PERIOD_INTERESTS, firstPeriod)}</Text>
        </Card>
      )}

      {!editing && (
        <>
          <Label>¿Ya tienes una deuda en esta tarjeta?</Label>
          <ChoiceButtons items={YES_NO} selected={hasDebt ? 'yes' : 'no'} onSelect={(v) => setHasDebt(v === 'yes')} />
          {hasDebt && (
            <>
              <Label>Cuánto debes hoy</Label>
              <MoneyInput value={debtAmount} onChangeCents={setDebtAmount} placeholder="$ 0" />
              <Label>Cuotas que te faltan (1 a 72)</Label>
              <Input
                value={debtInstallments}
                onChangeText={setDebtInstallments}
                placeholder="12"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.hint}>Se registra como una deuda inicial con la fecha de hoy.</Text>
            </>
          )}
        </>
      )}

      {editing && <RateUpdate card={card} />}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13 },
  muted: { ...type.caption, color: colors.textMuted },
  fixed: { color: colors.text, fontSize: 16 },
  error: { color: colors.danger },
  toggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  toggleText: { ...type.subtitle },
  advanced: { gap: space.xs },
  recovery: { gap: space.sm },
});
