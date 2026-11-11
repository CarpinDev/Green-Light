import { StyleSheet, View } from 'react-native';

import type { Light } from '@/api/types';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatMonthShort } from '@/dates';
import { barGeometry, type ChartBar } from '@/home/summary';
import { formatCop } from '@/money';
import { colors, fonts, light, radius, space, type } from '@/theme/tokens';

/** Lo que mide la barra más grande, y lo mínimo que mide cualquiera (para que un cierre diminuto se vea). */
const MAX_BAR = 120;
const MIN_BAR = 4;

const LEGEND: Light[] = ['green', 'yellow', 'red'];

/**
 * El cierre de cada mes como barras, dibujadas con Views (sin librería). Todas comparten una escala; los
 * cierres positivos crecen hacia arriba desde la línea base y los negativos cuelgan hacia abajo.
 */
export function MonthBars({ bars }: { bars: readonly ChartBar[] }) {
  const { up, down, shapes } = barGeometry(bars, MAX_BAR, MIN_BAR);

  const summary = bars
    .map((b) => `${formatMonthShort(b.month)} ${formatCop(b.value)}, ${light[b.light].label}`)
    .join('; ');

  return (
    <Card style={styles.card}>
      <View style={styles.title}>
        <Text style={styles.heading}>Próximos {bars.length} meses</Text>
        <Text style={styles.caption}>cierre de cada mes</Text>
      </View>

      <View accessible accessibilityLabel={`Cierre de cada mes: ${summary}`}>
        <View style={styles.plot}>
          {bars.map((bar, i) => {
            const shape = shapes[i];
            if (shape === undefined) return null;
            return (
              <View key={bar.month} style={[styles.column, { height: up + down }]}>
                <View
                  style={[
                    styles.bar,
                    { height: shape.height, backgroundColor: light[bar.light].bg },
                    // Sobre la línea base (que está a `up` del borde superior) o colgando de ella
                    shape.below ? { top: up } : { top: up - shape.height },
                  ]}
                />
              </View>
            );
          })}
          <View pointerEvents="none" style={[styles.baseline, { top: up }]} />
        </View>

        <View style={styles.labels}>
          {bars.map((bar, i) => (
            <Text key={bar.month} style={[styles.label, i === 0 && styles.labelNow]}>
              {formatMonthShort(bar.month)}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.legend}>
        {LEGEND.map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: light[key].bg }]} />
            <Text style={styles.caption}>{light[key].label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  title: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  heading: { ...type.subtitle },
  caption: { ...type.caption, color: colors.textMuted },
  plot: { flexDirection: 'row', gap: space.sm },
  column: { flex: 1 },
  bar: { position: 'absolute', alignSelf: 'center', left: '15%', right: '15%', borderRadius: radius.sm },
  baseline: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  labels: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  label: { ...type.caption, flex: 1, textAlign: 'center', color: colors.textMuted },
  labelNow: { fontFamily: fonts.bodyBold, color: colors.text },
  legend: { flexDirection: 'row', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
