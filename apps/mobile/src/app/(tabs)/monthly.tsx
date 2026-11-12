import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet } from 'react-native';

import { getJson } from '@/api/client';
import type { FixedExpense, RecurringIncome } from '@/api/types';
import { MonthlySection } from '@/components/monthly/monthly-section';
import { QueryState } from '@/components/query-state';
import { listKey } from '@/monthly/kinds';
import { useTabBarClearance } from '@/navigation';
import { space } from '@/theme/tokens';

export default function Monthly() {
  const incomes = useQuery({
    queryKey: listKey('income'),
    queryFn: () => getJson<RecurringIncome[]>('/recurring-incomes'),
  });
  const expenses = useQuery({
    queryKey: listKey('expense'),
    queryFn: () => getJson<FixedExpense[]>('/fixed-expenses'),
  });
  const clearance = useTabBarClearance();

  // Cada sección con su propio estado: si una falla o carga, la otra no se queda esperando
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: clearance }]}>
      <QueryState inline query={incomes} errorTitle="No se pudieron cargar tus ingresos.">
        {(data) => <MonthlySection kind="income" items={data} />}
      </QueryState>

      <QueryState inline query={expenses} errorTitle="No se pudieron cargar tus gastos fijos.">
        {(data) => <MonthlySection kind="expense" items={data} />}
      </QueryState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
});
