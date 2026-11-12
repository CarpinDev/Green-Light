import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { Movement } from '@/api/types';
import { Button } from '@/components/button';
import { MovementRow } from '@/components/movements/movement-row';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { groupByDay } from '@/movements/logic';
import { colors, space, type } from '@/theme/tokens';

/** Todos los movimientos que ya pasaron (hasta 100), agrupados por día. */
export default function Movements() {
  const movements = useQuery({
    queryKey: ['movements', { limit: 100 }],
    queryFn: () => getJson<Movement[]>('/movements?limit=100'),
  });

  return (
    <QueryState query={movements} errorTitle="No se pudieron cargar tus movimientos.">
      {(data) =>
        data.length === 0 ? (
          // Vacío con una invitación a registrar el primero
          <View style={styles.empty}>
            <Text style={type.subtitle}>Todavía no hay movimientos</Text>
            <Text style={styles.muted}>Registra un gasto o un ingreso y aparecerá aquí.</Text>
            <Link href="/expenses/new" asChild>
              <Button label="Registrar un gasto" />
            </Link>
            <Link href="/incomes/new" asChild>
              <Button label="Registrar un ingreso" variant="secondary" />
            </Link>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {groupByDay(data, today()).map((group) => (
              <View key={group.date} style={styles.group}>
                <Text style={styles.day}>{group.title}</Text>
                {group.items.map((movement) => (
                  <MovementRow key={movement.id} movement={movement} showDate={false} />
                ))}
              </View>
            ))}
          </ScrollView>
        )
      }
    </QueryState>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  group: { gap: space.md },
  day: { ...type.caption, color: colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', padding: space.xxl, gap: space.md },
  muted: { ...type.caption, color: colors.textMuted },
});
