import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { InstallmentOption, Light, MonthSummary, Product, SimulationResponse } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { MoneyInput } from '@/components/money-input';
import { QueryState } from '@/components/query-state';
import { Select } from '@/components/select';
import { Text } from '@/components/text';
import { currentMonth, formatDay, formatMonth } from '@/dates';
import { formatCop } from '@/money';
import { useTabBarClearance } from '@/navigation';
import { verdict, worstLight } from '@/simulator/verdict';
import { colors, fonts, light, radius, space, type } from '@/theme/tokens';

/** Lo que se mandó a simular: el resultado se explica contra esto (p. ej. cuánto cupo queda). */
interface Request {
  cardId: number;
  amountCents: number;
  installments: number;
}

/** El último resultado bueno, con el semáforo de cada plazo que ya se simuló para esta misma compra. */
interface Last {
  result: SimulationResponse;
  request: Request;
  /** Plazo -> peor semáforo de los meses con la compra. La API solo calcula el plazo que se pide: el resto se va llenando. */
  lights: Record<number, Light>;
}

export default function Simulate() {
  const clearance = useTabBarClearance();
  const [cardId, setCardId] = useState<number | null>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ['products'], queryFn: () => getJson<Product[]>('/products') });

  // POST /simulations no guarda nada: no hay nada que invalidar, la proyección sigue igual
  // El último resultado bueno vive en el estado: mientras llega el siguiente, la mutación pasa a
  // pending y su data se borra, y sin esto el resultado desaparecería (y la página saltaría arriba)
  const [last, setLast] = useState<Last | null>(null);
  const simulate = useMutation({
    mutationFn: (body: Request) => postJson<SimulationResponse>('/simulations', body),
    onSuccess: (result, body) =>
      setLast((prev) => {
        const sameBuy =
          prev !== null && prev.request.cardId === body.cardId && prev.request.amountCents === body.amountCents;
        const known = sameBuy ? prev.lights : {};
        return {
          result,
          request: body,
          lights: { ...known, [result.installments]: worstLight(result.with, currentMonth()) },
        };
      }),
    // Un resultado viejo junto a un error sería de otra consulta: mejor quitarlo
    onError: () => setLast(null),
  });

  /** Valida el formulario y simula con `cuotas` (las de la opción que se tocó, o 1 la primera vez). */
  const run = (cuotas: number) => {
    if (cardId === null) return setFormError('Elige la tarjeta.');
    if (amountCents === null || amountCents === 0) {
      return setFormError('Escribe el valor de la compra (ej. 1.200.000).');
    }

    setFormError(null);
    simulate.mutate({ cardId, amountCents, installments: cuotas });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles.inputs}>
        <Text style={styles.caption}>Valor de la compra</Text>
        <MoneyInput large value={amountCents} onChangeCents={setAmountCents} placeholder="$ 0" />

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.caption}>Con</Text>
          <View style={styles.select}>
            <QueryState
              inline
              query={products}
              errorTitle="No se pudieron cargar tus tarjetas."
              emptyText="Todavía no tienes tarjetas de crédito: créala primero."
              isEmpty={(data) => !data.some((p) => p.kind === 'credit_card')}
            >
              {(data) => (
                <Select
                  placeholder="Elige la tarjeta"
                  items={data
                    .filter((p) => p.kind === 'credit_card')
                    .map((c) => ({ id: c.id, label: `${c.name} ····${c.last4}` }))}
                  selected={cardId}
                  onSelect={setCardId}
                />
              )}
            </QueryState>
          </View>
        </View>
      </Card>

      <Button
        label={simulate.isPending ? 'Simulando…' : 'Simular'}
        loading={simulate.isPending}
        onPress={() => run(last?.result.installments ?? 1)}
      />

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {simulate.isError && <Text style={styles.error}>{errorText(simulate.error)}</Text>}

      {last !== null && <Result last={last} busy={simulate.isPending} onPickOption={run} />}
    </ScrollView>
  );
}

function Result({
  last,
  busy,
  onPickOption,
}: {
  last: Last;
  busy: boolean;
  onPickOption: (installments: number) => void;
}) {
  const { result, request, lights } = last;
  const chosen = result.options.find((o) => o.installments === result.installments);
  const outcome = verdict(lights[result.installments] ?? 'green', result.exceedsLimit);

  return (
    // Atenuado mientras llega el resultado nuevo: se ve que está desactualizado, pero no desaparece
    <View style={[styles.result, busy && styles.resultBusy]}>
      <Text style={styles.caption}>Compara las cuotas · con tu saldo al {formatDay(result.asOf)}</Text>

      <View style={styles.grid}>
        {result.options.map((option) => (
          <OptionTile
            key={option.installments}
            option={option}
            selected={option.installments === result.installments}
            light={lights[option.installments]}
            disabled={busy}
            onPress={() => onPickOption(option.installments)}
          />
        ))}
      </View>

      {chosen !== undefined && (
        <Card style={styles.detail}>
          <View style={styles.detailTitle}>
            <Text style={styles.heading}>
              {chosen.installments === 1 ? 'A 1 cuota' : `A ${chosen.installments} cuotas`}
            </Text>
            <LightBadge light={outcome.light} label={outcome.label} />
          </View>
          <View style={styles.figures}>
            <Figure label="Cuota" cents={chosen.firstPayment} />
            <Figure label="Intereses" cents={chosen.totalInterest} />
            <Figure label="Costo real" cents={chosen.totalCost} />
          </View>
          <Text style={result.exceedsLimit ? styles.alert : styles.caption}>
            {result.exceedsLimit
              ? `No cabe en tu cupo: hoy tienes ${formatCop(result.availableCredit)} libres.`
              : `Cupo libre hoy: ${formatCop(result.availableCredit)}. Después de comprar te quedan ${formatCop(result.availableCredit - request.amountCents)}.`}
          </Text>
        </Card>
      )}

      <View style={styles.section}>
        <Text style={styles.heading}>Mes a mes, con y sin la compra</Text>
        <Comparison without={result.without} withPurchase={result.with} />
      </View>
    </View>
  );
}

function Figure({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatCop(cents)}
      </Text>
    </View>
  );
}

/** Una de las opciones 1/3/6/12: la cuota por mes, los intereses y, si ya se simuló, su punto de semáforo. */
function OptionTile({
  option,
  selected,
  light: status,
  disabled,
  onPress,
}: {
  option: InstallmentOption;
  selected: boolean;
  /** undefined: este plazo todavía no se ha simulado y no se sabe cómo queda el semáforo. */
  light: Light | undefined;
  disabled: boolean;
  onPress: () => void;
}) {
  const label = option.installments === 1 ? '1 cuota' : `${option.installments} cuotas`;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={status === undefined ? label : `${label}, ${light[status].label}`}
      style={[styles.tile, disabled && styles.inactive]}
    >
      <Card style={[styles.tileCard, selected && styles.tileSelected]}>
        <View style={styles.tileTop}>
          <Text style={selected ? styles.tileLabelSelected : styles.caption}>{label}</Text>
          {status !== undefined && <View style={[styles.dot, { backgroundColor: light[status].bg }]} />}
        </View>
        <Text style={styles.tileAmount} numberOfLines={1} adjustsFontSizeToFit>
          {formatCop(option.firstPayment)}
          {option.installments > 1 && <Text style={styles.perMonth}> /mes</Text>}
        </Text>
        {option.totalInterest === 0 ? (
          <Text style={styles.noInterest}>Sin intereses</Text>
        ) : (
          <Text style={styles.caption}>+{formatCop(option.totalInterest)} intereses</Text>
        )}
      </Card>
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
          <Card key={after.month} style={[styles.monthRow, differs && styles.monthRowChanged]}>
            <Text style={styles.month}>{formatMonth(after.month)}</Text>
            <View style={styles.monthColumns}>
              <MonthColumn title="Sin la compra" month={before} />
              <MonthColumn
                title="Con la compra"
                month={after}
                diff={before && after.closingBalance - before.closingBalance}
              />
            </View>
          </Card>
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
      <Text style={styles.caption}>{title}</Text>
      <Text style={styles.closing}>{formatCop(month.closingBalance)}</Text>
      {diff !== undefined && diff !== 0 && (
        <Text style={diff < 0 ? styles.diffDown : styles.diffUp}>
          {diff < 0 ? '−' : '+'}
          {formatCop(Math.abs(diff))}
        </Text>
      )}
      <LightBadge light={month.light} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, maxWidth: 640, width: '100%', alignSelf: 'center' },
  caption: { ...type.caption, color: colors.textMuted },
  heading: { ...type.subtitle },
  error: { color: colors.danger },
  alert: { color: colors.danger, fontFamily: fonts.bodyBold },
  ok: { color: light.green.bg, fontFamily: fonts.bodySemiBold },
  inactive: { opacity: 0.5 },

  inputs: { gap: space.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  select: { flex: 1 },

  result: { gap: space.md },
  resultBusy: { opacity: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexBasis: '47%', flexGrow: 1 },
  tileCard: { gap: space.xs, padding: space.md, borderWidth: 2 },
  tileSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabelSelected: { ...type.caption, color: colors.primary },
  tileAmount: { ...type.subtitle, fontSize: 20 },
  perMonth: { ...type.caption, color: colors.textMuted },
  noInterest: { ...type.caption, color: light.green.bg },
  dot: { width: 10, height: 10, borderRadius: radius.pill },

  detail: { gap: space.md },
  detailTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  figures: { flexDirection: 'row', gap: space.md },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...type.subtitle, fontSize: 16 },

  section: { gap: space.sm },
  comparison: { gap: space.sm },
  monthRow: { gap: 6 },
  // El mes que cambia de color: se distingue por el borde y por el aviso de arriba, no solo por el color
  monthRowChanged: { borderColor: colors.danger, backgroundColor: colors.surfaceAlt },
  month: { ...type.subtitle, fontSize: 16, textTransform: 'capitalize' },
  monthColumns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1, gap: 2 },
  closing: { ...type.subtitle },
  diffDown: { color: colors.danger, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  diffUp: { color: light.green.bg, fontFamily: fonts.bodySemiBold, fontSize: 13 },
});
