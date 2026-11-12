import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { CardPlan, PlanCut } from '@/api/types';
import { Card } from '@/components/card';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatDay, formatMonthShort } from '@/dates';
import { formatCop } from '@/money';
import { barHeights, planBars } from '@/products/plan';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

const MAX_BAR = 120;
const MIN_BAR = 4;

/** El plan de pagos de una tarjeta: el mínimo de cada corte en barras (el próximo, destacado) y la lista del desglose. */
export function PlanSection({ cardId }: { cardId: number }) {
  const plan = useQuery({
    queryKey: ['cards', cardId, 'plan'],
    queryFn: () => getJson<CardPlan>(`/cards/${cardId}/plan?cuts=6`),
  });

  return (
    <View style={styles.section}>
      <Text style={type.title}>Plan de pagos</Text>
      <QueryState inline query={plan} errorTitle="No se pudo cargar el plan de pagos.">
        {({ cuts }) => (
          <>
            <PlanBarsCard cuts={cuts} />
            <Card style={styles.list}>
              {cuts.map((cut, i) => (
                <CutRow key={cut.cutDate} cut={cut} first={i === 0} />
              ))}
            </Card>
          </>
        )}
      </QueryState>
    </View>
  );
}

function PlanBarsCard({ cuts }: { cuts: readonly PlanCut[] }) {
  const bars = planBars(cuts);
  const heights = barHeights(
    bars.map((b) => b.value),
    MAX_BAR,
    MIN_BAR,
  );
  const summary = bars.map((b) => `${formatMonthShort(b.month)} ${formatCop(b.value)}`).join('; ');

  return (
    <Card style={styles.bars}>
      <View style={styles.titleRow}>
        <Text style={type.subtitle}>Pago mínimo de cada corte</Text>
      </View>
      <View accessible accessibilityLabel={`Pago mínimo de cada corte: ${summary}`}>
        <View style={styles.plot}>
          {bars.map((bar, i) => (
            <View key={bar.cutDate} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  { height: heights[i] },
                  { backgroundColor: bar.highlighted ? colors.primary : colors.primarySoft },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.labels}>
          {bars.map((bar) => (
            <Text key={bar.cutDate} style={[styles.label, bar.highlighted && styles.labelNow]}>
              {formatMonthShort(bar.month)}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}

function CutRow({ cut, first }: { cut: PlanCut; first: boolean }) {
  const { capital, interest, fees } = cut.minimum;
  const parts = [`capital ${formatCop(capital)}`, `intereses ${formatCop(interest)}`];
  if (fees > 0) parts.push(`manejo y seguro ${formatCop(fees)}`);

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowMain}>
          <Text style={styles.name}>Paga antes del {formatDay(cut.dueDate)}</Text>
          <Text style={styles.muted}>
            Corte {formatDay(cut.cutDate)}
            {first && ' · próximo pago'}
          </Text>
        </View>
        <Text style={[styles.amount, first && styles.amountNow]}>{formatCop(cut.minimum.total)}</Text>
      </View>
      <Text style={styles.muted}>{parts.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  bars: { gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  plot: { flexDirection: 'row', gap: space.sm, height: MAX_BAR, alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: radius.sm },
  labels: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  label: { ...type.caption, flex: 1, textAlign: 'center', color: colors.textMuted },
  labelNow: { fontFamily: fonts.bodyBold, color: colors.text },
  list: { paddingVertical: space.xs },
  row: { gap: 2, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowMain: { flex: 1, gap: 2 },
  name: type.bodyMedium,
  muted: { ...type.caption, color: colors.textMuted },
  amount: { ...type.subtitle, fontSize: 16 },
  amountNow: { color: colors.primary },
});
