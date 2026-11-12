import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CardSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { formatCop } from '@/money';
import { formatPercent } from '@/products/rates';
import { colors, space, type } from '@/theme/tokens';

/** Las tarjetas de crédito: una fila por tarjeta (cupo, corte, pago y tasa vigente) que abre su edición. */
export function CardsSection({ cards }: { cards: readonly CardSummary[] }) {
  if (cards.length === 0) {
    return (
      <Card style={styles.empty}>
        <Text style={type.subtitle}>Agrega tu primera tarjeta</Text>
        <Text style={styles.muted}>
          Con tu tarjeta la app calcula cuotas, intereses y cuándo vence cada pago, y te dice si puedes comprar.
        </Text>
        <Link href="/cards/new" asChild>
          <Button label="Agregar tarjeta" />
        </Link>
      </Card>
    );
  }

  return (
    <Card style={styles.list}>
      {cards.map((card) => (
        <Link key={card.id} href={{ pathname: '/cards/[id]', params: { id: String(card.id) } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${card.name}`} style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.name} numberOfLines={1}>
                {card.name} <Text style={styles.muted}>····{card.last4}</Text>
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                Cupo {formatCop(card.creditLimitCents)}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                corte día {card.cutDay} · pago día {card.dueDay}
              </Text>
            </View>
            <Text style={card.currentRate === null ? styles.muted : styles.rate}>
              {card.currentRate === null ? 'Sin tasa' : `${formatPercent(card.currentRate.ea)} E.A.`}
            </Text>
          </Pressable>
        </Link>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { gap: space.md },
  list: { paddingVertical: space.xs },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
  },
  main: { flex: 1, gap: 2 },
  name: type.bodyMedium,
  rate: { ...type.bodyMedium, color: colors.primary },
  muted: { ...type.caption, color: colors.textMuted },
});
