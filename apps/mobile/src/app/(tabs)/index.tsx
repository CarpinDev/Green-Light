import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { getJson } from '@/api/client';
import { isStaleBalance } from '@/api/errors';
import type { Product, ProjectionResponse } from '@/api/types';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { HeroCard } from '@/components/home/hero-card';
import { MonthBars } from '@/components/home/month-bars';
import { StatPair } from '@/components/home/stat-pair';
import { UpcomingList } from '@/components/home/upcoming-list';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { currentMonth, formatDayShort, STALE_DAYS, today } from '@/dates';
import {
  alertMessage,
  chartBars,
  firstVisibleMonth,
  incomeShare,
  upcomingMovements,
  visibleMonths,
} from '@/home/summary';
import { useTabBarClearance } from '@/navigation';
import { colors, type } from '@/theme/tokens';

export default function Home() {
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });
  // Los nombres de las tarjetas para las alertas. Si no llegan, las alertas salen sin nombre: no bloquea el inicio
  const products = useQuery({ queryKey: ['products'], queryFn: () => getJson<Product[]>('/products') });
  const clearance = useTabBarClearance();

  return (
    <QueryState
      query={projection}
      errorTitle={titleOf}
      errorAction={(error, retry) =>
        isStaleBalance(error) ? (
          // Reintentar no sirve: el saldo sigue viejo hasta que lo confirmes
          <Link href="/products" asChild>
            <Button label="Confirmar saldo" />
          </Link>
        ) : (
          <Button label="Reintentar" onPress={retry} />
        )
      }
    >
      {({ asOf, daysSinceBalance, staleAccounts, months, alerts }) => {
        const visible = visibleMonths(months, currentMonth());
        const current = firstVisibleMonth(months, currentMonth());
        const movements = upcomingMovements(
          visible.flatMap((m) => m.events),
          today(),
        );

        return (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
            refreshControl={
              <RefreshControl
                refreshing={projection.isRefetching}
                onRefresh={() => void projection.refetch()}
                tintColor={colors.primary}
              />
            }
          >
            <Text style={styles.caption}>
              Saldo al {formatDayShort(asOf)} · {daysAgo(daysSinceBalance)}
            </Text>

            {daysSinceBalance > STALE_DAYS && (
              <Banner action={{ label: 'Confirmar saldo', href: '/products' }}>
                Tu último saldo tiene {daysSinceBalance} días: confírmalo para que la proyección sea fiable.
              </Banner>
            )}
            {staleAccounts.length > 0 && (
              <Banner action={{ label: 'Confirmar saldo', href: '/products' }}>
                {staleAccounts.length === 1
                  ? 'Una cuenta tiene un saldo más viejo que el resto.'
                  : `${staleAccounts.length} cuentas tienen un saldo más viejo que el resto.`}{' '}
                Actualízalas.
              </Banner>
            )}

            {current === undefined ? (
              <Text style={styles.caption}>No hay meses proyectados desde el mes actual.</Text>
            ) : (
              <>
                <HeroCard month={current} share={incomeShare(current)} />
                <StatPair income={current.income} outflow={current.outflow} />
                <MonthBars bars={chartBars(visible)} />
              </>
            )}

            {alerts.map((alert) => (
              <Banner key={`${alert.kind}-${alert.refId}`}>{alertMessage(alert, products.data ?? [])}</Banner>
            ))}

            <UpcomingList events={movements} />
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

/** "hoy", "hace 1 día", "hace 5 días". */
function daysAgo(days: number): string {
  if (days <= 0) return 'hoy';
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** Un 409 no es un error genérico: es el saldo viejo, y la solución es confirmarlo. */
function titleOf(error: Error): string {
  return isStaleBalance(error) ? 'Falta un saldo reciente' : 'No se pudo cargar la proyección';
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  caption: { ...type.caption, color: colors.textMuted },
});
