import { StyleSheet, View } from 'react-native';

import type { MonthSummary } from '@/api/types';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { Text } from '@/components/text';
import { formatDayShort, formatMonthName } from '@/dates';
import { formatCop } from '@/money';
import { colors, radius, space, type } from '@/theme/tokens';

/** La tarjeta principal: con cuánto cierra el mes, cómo va el semáforo y qué parte del ingreso queda. */
export function HeroCard({
  month,
  share,
}: {
  month: MonthSummary;
  /** % entero del ingreso que queda; null si no hay ingreso. */ share: number | null;
}) {
  const details = [
    share !== null && `Te queda el ${share} % del ingreso`,
    month.lowestBalanceDate !== undefined &&
      `lo más bajo: ${formatCop(month.lowestBalance)} el ${formatDayShort(month.lowestBalanceDate)}`,
  ].filter((part): part is string => part !== false);

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.caption}>Cierras {formatMonthName(month.month)} con</Text>
        <LightBadge light={month.light} />
      </View>

      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
        {formatCop(month.closingBalance)}
      </Text>

      {share !== null && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel="Parte del ingreso que queda al cierre"
          accessibilityValue={{ min: 0, max: 100, now: share }}
        >
          <View style={[styles.fill, { width: `${share}%` }]} />
        </View>
      )}

      {details.length > 0 && <Text style={styles.caption}>{details.join(' · ')}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  caption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  amount: { ...type.display },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
});
