import { Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CashEvent } from '@/api/types';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatDayShort } from '@/dates';
import { formatCop } from '@/money';
import { colors, space, type } from '@/theme/tokens';

/** Una fila compacta con lo próximo que viene ("Arriendo · 5 nov · − $ 1.200.000") y el enlace a la lista. */
export function UpcomingTeaser({ next }: { next: CashEvent | undefined }) {
  return (
    <Link href="/upcoming" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="Ver próximos movimientos">
        <Card style={styles.card}>
          <View style={styles.text}>
            <Text style={styles.caption}>Próximos</Text>
            <Text style={styles.next} numberOfLines={2}>
              {next === undefined
                ? 'No hay movimientos próximos'
                : `${next.label} · ${formatDayShort(next.date)} · ${next.amount > 0 ? '+' : '−'} ${formatCop(Math.abs(next.amount))}`}
            </Text>
          </View>
          <View style={styles.action}>
            <Text style={styles.link}>Ver próximos</Text>
            <Feather name="chevron-right" size={18} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  text: { flex: 1, gap: 2 },
  caption: { ...type.caption, color: colors.textMuted },
  next: type.bodyMedium,
  action: { flexDirection: 'row', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700' },
});
