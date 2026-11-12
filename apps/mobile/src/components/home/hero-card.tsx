import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { Light, MonthSummary } from '@/api/types';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { Text } from '@/components/text';
import { balanceTexts, cashFlowLine, remainingTitle, shareLine } from '@/home/summary';
import { formatCop } from '@/money';
import { colors, light as lights, radius, space, type } from '@/theme/tokens';

interface HeroCardProps {
  /** Lo que tienes hoy y de dónde sale esa cifra. */
  balance: { currentBalanceCents: number; today: string; asOf: string; openingBalanceCents: number };
  /** El mes que se muestra: de aquí salen el título y el flujo de caja. */
  month: MonthSummary;
  /** Lo que de verdad te queda libre a fin de mes (la protagonista) y su semáforo. */
  remainingCents: number;
  light: Light;
  /** % entero del ingreso que queda del restante real; null si no hay ingreso. */
  share: number | null;
}

/**
 * La tarjeta principal, en tres niveles: el restante real a fin de mes (lo que responde "¿cuánto puedo
 * gastar?"), lo que tienes hoy, y el flujo de caja de la proyección en una línea pequeña.
 */
export function HeroCard({ balance, month, remainingCents, light, share }: HeroCardProps) {
  const { negative, asOfLine } = balanceTexts(balance);
  const color = lights[light].bg;
  const percent = shareLine(share);

  return (
    <Card style={styles.card}>
      <View style={styles.block}>
        <View style={styles.top}>
          <Text style={styles.caption}>{remainingTitle(month)}</Text>
          <LightBadge light={light} />
        </View>

        <Text
          style={[styles.amount, { color }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`${remainingTitle(month)}: ${formatCop(remainingCents)}`}
        >
          {formatCop(remainingCents)}
        </Text>

        {share !== null && (
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel="Parte del ingreso que te queda"
            accessibilityValue={{ min: 0, max: 100, now: share }}
          >
            <View style={[styles.fill, { width: `${share}%`, backgroundColor: color }]} />
          </View>
        )}
        {percent !== null && <Text style={styles.caption}>{percent}</Text>}
      </View>

      <View style={styles.divider} />

      <View style={styles.block}>
        <Text style={styles.caption}>Tienes hoy</Text>
        <View style={styles.amountRow}>
          {negative && <Feather name="alert-triangle" size={22} color={lights.yellow.bg} />}
          <Text
            style={[styles.today, negative && styles.negative]}
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

      <Text style={styles.small}>{cashFlowLine(month)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  block: { gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  caption: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  small: { ...type.captionSmall, color: colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { ...type.display },
  today: { ...type.title, flexShrink: 1 },
  negative: { color: lights.yellow.bg },
  warning: { ...type.bodyMedium, color: lights.yellow.bg },
  divider: { height: 1, backgroundColor: colors.border },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
