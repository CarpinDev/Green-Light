import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { LoanDetail } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DangerZone } from '@/components/products/danger-zone';
import { PaymentsList } from '@/components/products/payments-list';
import { ScheduleTable } from '@/components/products/schedule-table';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatDay, formatDayShort } from '@/dates';
import { formatCop } from '@/money';
import { formatPercent } from '@/products/rates';
import { colors, space, type } from '@/theme/tokens';

/**
 * El detalle de un préstamo: saldo, cuota, próxima fecha y fin; la tabla de amortización; los abonos; abonar a
 * capital, editar y la zona de peligro. Todo sale del cronograma que calcula la API.
 */
export default function LoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loan = useQuery({ queryKey: ['loans', Number(id)], queryFn: () => getJson<LoanDetail>(`/loans/${id}`) });

  return (
    <QueryState query={loan} errorTitle="No se pudo cargar el préstamo.">
      {(data) => (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.header}>
            <Text style={type.title}>
              {data.name} <Text style={styles.muted}>····{data.last4}</Text>
            </Text>
            <Text style={styles.muted}>
              {data.bank}
              {data.rate !== null && ` · ${formatPercent(data.rate.ea)} E.A.`}
            </Text>

            <Text style={styles.label}>Saldo de capital</Text>
            <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
              {formatCop(data.balanceCents)}
            </Text>

            {data.nextDueDate === null ? (
              <Text style={styles.muted}>Ya no tiene cuotas pendientes.</Text>
            ) : (
              <>
                <Text style={styles.line}>
                  Cuota {formatCop(data.installmentCents)} el {formatDay(data.nextDueDate)}
                </Text>
                <Text style={styles.muted}>
                  {data.remainingInstallments === 1 ? 'Queda 1 cuota' : `Quedan ${data.remainingInstallments} cuotas`}
                  {data.endDate !== null &&
                    ` · la última es el ${formatDayShort(data.endDate)} ${data.endDate.slice(0, 4)}`}
                </Text>
                {data.insuranceCents > 0 && (
                  <Text style={styles.muted}>Incluye {formatCop(data.insuranceCents)} de seguro.</Text>
                )}
              </>
            )}

            <Link href={{ pathname: '/loans/[id]/edit', params: { id: String(data.id) } }} asChild>
              <Button label="Editar préstamo" variant="secondary" />
            </Link>
          </Card>

          {data.nextDueDate !== null && (
            <Link href={{ pathname: '/loans/[id]/payment', params: { id: String(data.id) } }} asChild>
              <Button label="Abonar a capital" />
            </Link>
          )}

          <View style={styles.section}>
            <Text style={type.title}>Cuotas</Text>
            <ScheduleTable rows={data.schedule} />
          </View>

          <PaymentsList productId={data.id} base="loans" />

          <DangerZone productId={data.id} kind="loan" />
        </ScrollView>
      )}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { gap: space.xs },
  section: { gap: space.md },
  label: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  balance: type.display,
  line: type.bodyMedium,
  muted: { ...type.caption, color: colors.textMuted },
});
