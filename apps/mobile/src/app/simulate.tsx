import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { InstallmentOption, MonthSummary, Product, SimulationResponse } from '@/api/types';
import { Label } from '@/components/label';
import { Options } from '@/components/options';
import { currentMonth, formatDay, formatMonth } from '@/dates';
import { LIGHT_COLOR, LIGHT_LABEL } from '@/light';
import { formatCop, parsePesos } from '@/money';

/** Lo que se mandó a simular: el resultado se explica contra esto (p. ej. cuánto cupo queda). */
interface Request {
  cardId: number;
  amountCents: number;
  installments: number;
}

export default function Simulate() {
  const [cardId, setCardId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ['products'], queryFn: () => getJson<Product[]>('/products') });
  const cards = (products.data ?? []).filter((p) => p.kind === 'credit_card');

  // POST /simulations no guarda nada: no hay nada que invalidar, la proyección sigue igual
  // El último resultado bueno vive en el estado: mientras llega el siguiente, la mutación pasa a
  // pending y su data se borra, y sin esto el resultado desaparecería (y la página saltaría arriba)
  const [last, setLast] = useState<{ result: SimulationResponse; amountCents: number } | null>(null);
  const simulate = useMutation({
    mutationFn: (body: Request) => postJson<SimulationResponse>('/simulations', body),
    onSuccess: (result, body) => setLast({ result, amountCents: body.amountCents }),
    // Un resultado viejo junto a un error sería de otra consulta: mejor quitarlo
    onError: () => setLast(null),
  });

  /** Valida el formulario y simula con `cuotas` (las del campo, o las de la opción que se tocó). */
  const run = (cuotas: number) => {
    const amountCents = parsePesos(amount);
    if (cardId === null) return setFormError('Elige la tarjeta.');
    if (amountCents === null || amountCents === 0) {
      return setFormError('Escribe un monto válido, solo números (ej. 1.200.000).');
    }
    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 72) return setFormError('Las cuotas van de 1 a 72.');

    setFormError(null);
    setInstallments(String(cuotas));
    simulate.mutate({ cardId, amountCents, installments: cuotas });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Label>Tarjeta</Label>
      {products.isPending ? (
        <ActivityIndicator />
      ) : products.isError ? (
        <Text style={styles.error}>No se pudieron cargar tus tarjetas.</Text>
      ) : cards.length === 0 ? (
        <Text style={styles.muted}>Todavía no tienes tarjetas de crédito: créala primero.</Text>
      ) : (
        <Options
          items={cards.map((c) => ({ id: c.id, label: `${c.name} ····${c.last4}` }))}
          selected={cardId}
          onSelect={setCardId}
        />
      )}

      <Label>Monto de la compra (pesos)</Label>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="1.200.000"
        keyboardType="numeric"
      />

      <Label>Cuotas</Label>
      <TextInput
        style={styles.input}
        value={installments}
        onChangeText={setInstallments}
        placeholder="1 a 72"
        keyboardType="numeric"
      />

      <Pressable
        onPress={() => run(Number(installments))}
        disabled={simulate.isPending}
        style={[styles.button, simulate.isPending && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{simulate.isPending ? 'Simulando…' : 'Simular'}</Text>
      </Pressable>

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {simulate.isError && <Text style={styles.error}>{errorText(simulate.error)}</Text>}

      {last !== null && (
        <Result result={last.result} amountCents={last.amountCents} busy={simulate.isPending} onPickOption={run} />
      )}
    </ScrollView>
  );
}

function Result({
  result,
  amountCents,
  busy,
  onPickOption,
}: {
  result: SimulationResponse;
  amountCents: number;
  busy: boolean;
  onPickOption: (installments: number) => void;
}) {
  return (
    // Atenuado mientras llega el resultado nuevo: se ve que está desactualizado, pero no desaparece
    <View style={[styles.result, busy && styles.resultBusy]}>
      <Text style={styles.muted}>Con tu saldo al {formatDay(result.asOf)}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cupo</Text>
        <Text>Hoy tienes {formatCop(result.availableCredit)} de cupo libre.</Text>
        {result.exceedsLimit ? (
          <Text style={styles.alert}>No cabe en tu cupo</Text>
        ) : (
          <Text>Después de esta compra te quedan {formatCop(result.availableCredit - amountCents)}.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>¿En cuántas cuotas?</Text>
        <Text style={styles.muted}>Toca un plazo para simularlo.</Text>
        {result.options.map((option) => (
          <OptionCard
            key={option.installments}
            option={option}
            selected={option.installments === result.installments}
            disabled={busy}
            onPress={() => onPickOption(option.installments)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mes a mes, con y sin la compra</Text>
        <Comparison without={result.without} withPurchase={result.with} />
      </View>
    </View>
  );
}

function OptionCard({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: InstallmentOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.option, selected && styles.optionSelected, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.optionTitle}>{option.installments === 1 ? '1 cuota' : `${option.installments} cuotas`}</Text>
      <Text>Primera cuota: {formatCop(option.firstPayment)}</Text>
      <Text>Interés total: {formatCop(option.totalInterest)}</Text>
      <Text>Costo total: {formatCop(option.totalCost)}</Text>
    </Pressable>
  );
}

/** Los meses desde el actual, uno junto al otro; los que cambian de color van resaltados. */
function Comparison({ without, withPurchase }: { without: MonthSummary[]; withPurchase: MonthSummary[] }) {
  const now = currentMonth();
  const base = new Map(without.map((m) => [m.month, m]));
  const rows = withPurchase.filter((m) => m.month >= now).map((after) => ({ before: base.get(after.month), after }));

  const changed = rows.filter((r) => r.before !== undefined && r.before.light !== r.after.light).length;

  return (
    <View style={styles.comparison}>
      <Text style={changed > 0 ? styles.alert : styles.ok}>
        {changed === 0
          ? 'Ningún mes cambia de color con esta compra.'
          : changed === 1
            ? 'Con esta compra 1 mes cambia de color.'
            : `Con esta compra ${changed} meses cambian de color.`}
      </Text>
      {rows.map(({ before, after }) => {
        const differs = before !== undefined && before.light !== after.light;
        return (
          <View key={after.month} style={[styles.monthRow, differs && styles.monthRowChanged]}>
            <Text style={styles.month}>{formatMonth(after.month)}</Text>
            <View style={styles.monthColumns}>
              <MonthColumn title="Sin la compra" month={before} />
              <MonthColumn
                title="Con la compra"
                month={after}
                diff={before && after.closingBalance - before.closingBalance}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MonthColumn({
  title,
  month,
  diff,
}: {
  title: string;
  month: MonthSummary | undefined;
  /** Cuánto cambia el cierre por la compra (centavos, con signo): una compra puede comerse el colchón sin cambiar el color. */
  diff?: number;
}) {
  if (month === undefined) return null;
  return (
    <View style={styles.column}>
      <Text style={styles.muted}>{title}</Text>
      <Text style={styles.closing}>{formatCop(month.closingBalance)}</Text>
      {diff !== undefined && diff !== 0 && (
        <Text style={diff < 0 ? styles.diffDown : styles.diffUp}>
          {diff < 0 ? '−' : '+'}
          {formatCop(Math.abs(diff))}
        </Text>
      )}
      <View style={[styles.badge, { backgroundColor: LIGHT_COLOR[month.light] }]}>
        <Text style={styles.badgeText}>{LIGHT_LABEL[month.light]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#d64545' },
  muted: { color: '#666', fontSize: 13 },
  result: { marginTop: 16, gap: 16 },
  resultBusy: { opacity: 0.5 },
  diffDown: { color: '#d64545', fontSize: 13, fontWeight: '600' },
  diffUp: { color: '#2e9e5b', fontSize: 13, fontWeight: '600' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  alert: { color: '#d64545', fontWeight: '700' },
  ok: { color: '#2e9e5b', fontWeight: '600' },
  option: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#e3e3e3', padding: 12, gap: 2 },
  optionSelected: { borderColor: '#1f6feb' },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  comparison: { gap: 8 },
  monthRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  monthRowChanged: { borderColor: '#d64545', backgroundColor: '#fff1f1' },
  month: { fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
  monthColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1, gap: 2 },
  closing: { fontSize: 18, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
