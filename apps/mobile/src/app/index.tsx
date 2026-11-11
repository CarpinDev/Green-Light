import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import { isStaleBalance } from '@/api/errors';
import type { MonthSummary, ProjectionResponse } from '@/api/types';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LightBadge } from '@/components/light-badge';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { currentMonth, formatDay, formatMonth, STALE_DAYS } from '@/dates';
import { formatCop } from '@/money';
import { colors, type } from '@/theme/tokens';

export default function Home() {
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });

  return (
    <QueryState
      query={projection}
      errorTitle={titleOf}
      errorAction={(error, retry) =>
        isStaleBalance(error) ? (
          // Reintentar no sirve: el saldo sigue viejo hasta que lo confirmes
          <Link href="/balances" asChild>
            <Button label="Confirmar saldo" />
          </Link>
        ) : (
          <Button label="Reintentar" onPress={retry} />
        )
      }
    >
      {({ asOf, daysSinceBalance, staleAccounts, months }) => {
        // El primer mes proyectado puede ya haber pasado: se muestra solo desde el mes actual
        const now = currentMonth();
        const visible = months.filter((m) => m.month >= now);

        return (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={projection.isRefetching}
                onRefresh={() => void projection.refetch()}
                tintColor={colors.primary}
              />
            }
          >
            <Text style={styles.asOf}>Saldo al {formatDay(asOf)}</Text>

            <Link href="/expenses/new" asChild>
              <Button label="Registrar gasto" />
            </Link>
            <Link href="/simulate" asChild>
              <Button label="¿Puedo comprar esto?" variant="secondary" />
            </Link>
            <Link href="/balances" asChild>
              <Button label="Confirmar saldos" variant="secondary" />
            </Link>

            {daysSinceBalance > STALE_DAYS && (
              <Banner action={{ label: 'Confirmar saldo', href: '/balances' }}>
                Tu último saldo tiene {daysSinceBalance} días: confírmalo para que la proyección sea fiable.
              </Banner>
            )}
            {staleAccounts.length > 0 && (
              <Banner action={{ label: 'Confirmar saldo', href: '/balances' }}>
                {staleAccounts.length === 1
                  ? 'Una cuenta tiene un saldo más viejo que el resto.'
                  : `${staleAccounts.length} cuentas tienen un saldo más viejo que el resto.`}{' '}
                Actualízalas.
              </Banner>
            )}

            {visible.length === 0 ? (
              <Text style={styles.muted}>No hay meses proyectados desde el mes actual.</Text>
            ) : (
              visible.map((month) => <MonthCard key={month.month} month={month} />)
            )}
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

function MonthCard({ month }: { month: MonthSummary }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.month}>{formatMonth(month.month)}</Text>
        <LightBadge light={month.light} />
      </View>
      <Text style={styles.label}>Cierra con</Text>
      <Text style={styles.closing}>{formatCop(month.closingBalance)}</Text>
      {month.lowestBalanceDate !== undefined && (
        <Text style={styles.muted}>
          Lo más bajo: {formatCop(month.lowestBalance)} el {formatDay(month.lowestBalanceDate)}
        </Text>
      )}
    </Card>
  );
}

/** Un 409 no es un error genérico: es el saldo viejo, y la solución es confirmarlo. */
function titleOf(error: Error): string {
  return isStaleBalance(error) ? 'Falta un saldo reciente' : 'No se pudo cargar la proyección';
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  asOf: { ...type.bodyMedium },
  muted: { ...type.caption, color: colors.textMuted },
  card: { gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { ...type.subtitle, textTransform: 'capitalize' },
  label: { ...type.captionSmall, color: colors.textMuted, marginTop: 8 },
  closing: { ...type.title },
});
