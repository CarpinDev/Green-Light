import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { MonthSummary } from '@/api/types';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { Text } from '@/components/text';
import { balanceTexts, projectionDetails, projectionTitle } from '@/home/summary';
import { formatCop } from '@/money';
import { colors, light, radius, space, type } from '@/theme/tokens';

interface HeroCardProps {
  /** Lo que tienes hoy y de dónde sale esa cifra. */
  balance: { currentBalanceCents: number; today: string; asOf: string; openingBalanceCents: number };
  /** El mes de la proyección que se muestra abajo. */
  month: MonthSummary;
  /** % entero del ingreso que queda; null si no hay ingreso. */
  share: number | null;
}

/**
 * La tarjeta principal, en dos niveles: arriba lo que tienes hoy (el saldo actual) y abajo la proyección a fin
 * de mes con su semáforo, la parte del ingreso que queda y lo más bajo.
 */
export function HeroCard({ balance, month, share }: HeroCardProps) {
  const { negative, asOfLine } = balanceTexts(balance);
  const details = projectionDetails(month, share);

  return (
    <Card style={styles.card}>
      <View style={styles.block}>
        <Text style={styles.caption}>Tienes hoy</Text>
        <View style={styles.amountRow}>
          {negative && <Feather name="alert-triangle" size={28} color={light.yellow.bg} />}
          <Text
            style={[styles.amount, negative && styles.negative]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Tienes hoy ${formatCop(balance.currentBalanceCents)}`}
          >
            {formatCop(balance.currentBalanceCents)}
          </Text>
        </View>
        {negative && <Text style={styles.warning}>Tu saldo está en negativo</Text>}
        <Text style={styles.caption}>{asOfLine}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.block}>
        <View style={styles.top}>
          <Text style={styles.caption}>{projectionTitle(month)}</Text>
          <LightBadge light={month.light} />
        </View>

        <Text style={styles.projected} numberOfLines={1} adjustsFontSizeToFit>
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
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  block: { gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  caption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { ...type.display, flexShrink: 1 },
  negative: { color: light.yellow.bg },
  warning: { ...type.bodyMedium, color: light.yellow.bg },
  divider: { height: 1, backgroundColor: colors.border },
  projected: { ...type.title },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
});
