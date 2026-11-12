import { StyleSheet, View } from 'react-native';

import type { Light, MonthSummary } from '@/api/types';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatDayShort, formatMonthName } from '@/dates';
import type { Commitment, MonthCommitments } from '@/home/commitments';
import { formatCop } from '@/money';
import { colors, light as lights, space, type } from '@/theme/tokens';

interface CommitmentsCardProps {
  month: Pick<MonthSummary, 'month'>;
  commitments: MonthCommitments;
  /** El semáforo del restante real. */
  light: Light;
}

/**
 * Lo que ya debes este mes (tarjetas por corte, gastos fijos y cuotas de préstamo) y cuánta plata te queda de
 * verdad libre después de eso.
 */
export function CommitmentsCard({ month, commitments, light }: CommitmentsCardProps) {
  const name = formatMonthName(month.month);
  const remainingColor = lights[light].bg;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={type.subtitle}>Compromisos de {name}</Text>
        <Text style={styles.total}>{formatCop(commitments.totalCents)}</Text>
      </View>

      {commitments.items.length === 0 ? (
        <Text style={styles.muted}>No tienes pagos pendientes este mes</Text>
      ) : (
        <View style={styles.list}>
          {commitments.items.map((item) => (
            <Row key={`${item.kind}-${item.refId ?? ''}-${item.dueDate}`} item={item} />
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.remaining}>
        <Text style={styles.muted}>Restante real a fin de {name}</Text>
        <Text
          style={[styles.remainingAmount, { color: remainingColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`Restante real a fin de ${name}: ${formatCop(commitments.realRemainingCents)}`}
        >
          {formatCop(commitments.realRemainingCents)}
        </Text>
      </View>
      <Text style={styles.muted}>
        Incluye pagos de tarjeta ya cortados que vencen el próximo mes; por eso es menor que la proyección.
      </Text>
    </Card>
  );
}

function Row({ item }: { item: Commitment }) {
  const card = item.kind === 'card_payment';
  const detail =
    card && item.cutDate !== undefined
      ? `corte ${formatDayShort(item.cutDate)} · vence ${formatDayShort(item.dueDate)}`
      : `vence ${formatDayShort(item.dueDate)}`;

  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      <View style={styles.amounts}>
        <Text style={styles.amount}>{formatCop(item.amount)}</Text>
        {card && item.fullPayment !== undefined && (
          <Text style={styles.small}>
            total {formatCop(item.fullPayment)}
            {item.estimated && ' · estimado'}
          </Text>
        )}
        {card && item.fullPayment === undefined && item.estimated && <Text style={styles.small}>estimado</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  total: { ...type.subtitle, flexShrink: 0 },
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  main: { flex: 1, gap: 2 },
  name: type.bodyMedium,
  amounts: { alignItems: 'flex-end', gap: 2 },
  amount: type.bodyMedium,
  small: { ...type.captionSmall, color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border },
  remaining: { gap: space.xs },
  remainingAmount: { ...type.title },
});
