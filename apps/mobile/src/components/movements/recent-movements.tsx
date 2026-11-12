import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { Movement } from '@/api/types';
import { MovementRow } from '@/components/movements/movement-row';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { colors, space, type } from '@/theme/tokens';

/** Los últimos 5 movimientos que ya pasaron, con el enlace a la lista completa. */
export function RecentMovements() {
  const movements = useQuery({
    queryKey: ['movements', { limit: 5 }],
    queryFn: () => getJson<Movement[]>('/movements?limit=5'),
  });

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={type.subtitle}>Movimientos recientes</Text>
        <Link href="/movements" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>Ver todos</Text>
          </Pressable>
        </Link>
      </View>
      <QueryState
        inline
        query={movements}
        errorTitle="No se pudieron cargar tus movimientos."
        emptyText="Todavía no hay movimientos."
      >
        {(data) => data.map((movement) => <MovementRow key={movement.id} movement={movement} />)}
      </QueryState>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.primary, fontWeight: '700' },
});
