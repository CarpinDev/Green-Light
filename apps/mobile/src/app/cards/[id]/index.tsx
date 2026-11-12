import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { CardSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DangerZone } from '@/components/products/danger-zone';
import { PaymentsList } from '@/components/products/payments-list';
import { OpeningDebtSection } from '@/components/products/opening-debt-section';
import { PlanSection } from '@/components/products/plan-section';
import { StatementCompare } from '@/components/products/statement-compare';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatCop } from '@/money';
import { formatPercent } from '@/products/rates';
import { colors, space, type } from '@/theme/tokens';

/**
 * El detalle de una tarjeta: su plan de pagos por corte, la deuda que ya traía, la comparación con el extracto
 * y, en "Editar", el formulario de sus datos y su tasa. La tarjeta sale del listado (la misma consulta de
 * Productos: abre al instante y sirve con la URL directa).
 */
export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cards = useQuery({ queryKey: ['cards'], queryFn: () => getJson<CardSummary[]>('/cards') });

  return (
    <QueryState query={cards} errorTitle="No se pudo cargar la tarjeta.">
      {(data) => {
        const card = data.find((c) => String(c.id) === id);
        if (card === undefined) {
          return (
            <View style={styles.missing}>
              <Text style={styles.muted}>Esta tarjeta ya no existe.</Text>
            </View>
          );
        }
        return (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.header}>
              <Text style={type.title}>
                {card.name} <Text style={styles.muted}>····{card.last4}</Text>
              </Text>
              <Text style={styles.muted}>
                Cupo {formatCop(card.creditLimitCents)} · corte día {card.cutDay} · pago día {card.dueDay}
              </Text>
              <Text style={styles.muted}>
                {card.currentRate === null ? 'Sin tasa vigente' : `Tasa ${formatPercent(card.currentRate.ea)} E.A.`}
              </Text>
              <Link href={{ pathname: '/cards/[id]/edit', params: { id: String(card.id) } }} asChild>
                <Button label="Editar tarjeta" variant="secondary" />
              </Link>
            </Card>

            <Link href={{ pathname: '/cards/[id]/payment', params: { id: String(card.id) } }} asChild>
              <Button label="Abonar a la deuda" />
            </Link>

            <PlanSection cardId={card.id} />
            <PaymentsList cardId={card.id} />
            <OpeningDebtSection cardId={card.id} />
            <StatementCompare cardId={card.id} />
            <DangerZone productId={card.id} kind="credit_card" />
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { gap: space.xs },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  muted: { ...type.caption, color: colors.textMuted },
});
