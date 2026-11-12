import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { getJson } from '@/api/client';
import { isStaleBalance } from '@/api/errors';
import type { CardSummary, Product, ProjectionResponse } from '@/api/types';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { CommitmentsCard } from '@/components/home/commitments-card';
import { HeroCard } from '@/components/home/hero-card';
import { MonthBars } from '@/components/home/month-bars';
import { StatPair } from '@/components/home/stat-pair';
import { RecentMovements } from '@/components/movements/recent-movements';
import { UpcomingTeaser } from '@/components/movements/upcoming-teaser';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { currentMonth, STALE_DAYS, today } from '@/dates';
import { monthCommitments, realRemainingLight } from '@/home/commitments';
import { alertMessage, chartBars, firstVisibleMonth, incomeShare, upcomingEvents, visibleMonths } from '@/home/summary';
import { useTabBarClearance } from '@/navigation';
import { colors, type } from '@/theme/tokens';

export default function Home() {
  const projection = useQuery({
    queryKey: ['projection'],
    queryFn: () => getJson<ProjectionResponse>('/projection?months=6'),
  });
  // Los nombres de las tarjetas para las alertas. Si no llegan, las alertas salen sin nombre: no bloquea el inicio
  const products = useQuery({ queryKey: ['products'], queryFn: () => getJson<Product[]>('/products') });
  // Para los nombres de las tarjetas y el umbral del semáforo. Si no llegan, hay respaldo: no bloquean el inicio
  const cards = useQuery({ queryKey: ['cards'], queryFn: () => getJson<CardSummary[]>('/cards') });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => getJson<{ yellowBelowIncomePct: string }>('/settings'),
  });
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
      {({
        asOf,
        daysSinceBalance,
        staleAccounts,
        months,
        alerts,
        today: apiToday,
        currentBalanceCents,
        openingBalanceCents,
      }) => {
        const visible = visibleMonths(months, currentMonth());
        const current = firstVisibleMonth(months, currentMonth());
        const next = upcomingEvents(months, currentMonth(), today())[0];
        // Sin mes actual no se pinta la tarjeta, así que el mes vacío no se usa
        const commitments = monthCommitments(months, current?.month ?? '', apiToday, cards.data ?? []);

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
                <HeroCard
                  balance={{ currentBalanceCents, today: apiToday, asOf, openingBalanceCents }}
                  month={current}
                  remainingCents={commitments.realRemainingCents}
                  light={realRemainingLight(
                    commitments.realRemainingCents,
                    current,
                    settings.data?.yellowBelowIncomePct ?? null,
                  )}
                  share={incomeShare({
                    closingBalance: commitments.realRemainingCents,
                    referenceIncome: current.referenceIncome,
                  })}
                />
                <CommitmentsCard month={current} commitments={commitments} />
                <StatPair income={current.income} outflow={current.outflow} />
                <MonthBars bars={chartBars(visible)} />
              </>
            )}

            {alerts.map((alert) => (
              <Banner key={`${alert.kind}-${alert.refId}`}>{alertMessage(alert, products.data ?? [])}</Banner>
            ))}

            <RecentMovements />
            <UpcomingTeaser next={next} />
          </ScrollView>
        );
      }}
    </QueryState>
  );
}

/** Un 409 no es un error genérico: es el saldo viejo, y la solución es confirmarlo. */
function titleOf(error: Error): string {
  return isStaleBalance(error) ? 'Falta un saldo reciente' : 'No se pudo cargar la proyección';
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  caption: { ...type.caption, color: colors.textMuted },
});
