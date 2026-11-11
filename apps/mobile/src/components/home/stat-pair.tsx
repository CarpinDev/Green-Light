import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatCop } from '@/money';
import { colors, light, space, type } from '@/theme/tokens';

/** Lo que entra y lo que sale del mes, lado a lado. `outflow` llega en positivo (como lo manda la API). */
export function StatPair({ income, outflow }: { income: number; outflow: number }) {
  return (
    <View style={styles.row}>
      <Stat icon="arrow-up" color={light.green.bg} label="Entra este mes" cents={income} />
      <Stat icon="arrow-down" color={colors.danger} label="Sale este mes" cents={outflow} />
    </View>
  );
}

function Stat({
  icon,
  color,
  label,
  cents,
}: {
  icon: 'arrow-up' | 'arrow-down';
  color: string;
  label: string;
  cents: number;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.label}>
        <Feather name={icon} size={16} color={color} />
        <Text style={styles.caption}>{label}</Text>
      </View>
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
        {formatCop(cents)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  card: { flex: 1, gap: space.xs, padding: space.md },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  caption: { ...type.caption, color: colors.textMuted },
  amount: { ...type.subtitle, fontSize: 20 },
});
