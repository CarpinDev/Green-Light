import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import { MonthlyForm } from '@/components/monthly/monthly-form';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { listKey, MONTHLY, type MonthlyItem, type MonthlyKind } from '@/monthly/kinds';
import { colors, space } from '@/theme/tokens';

/**
 * La pantalla de edición: busca el registro en el listado (la misma consulta de la pestaña Mensual, así
 * que abre al instante y también funciona abriendo la URL directa) y le pasa el registro al formulario.
 */
export function MonthlyEdit({ kind }: { kind: MonthlyKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const text = MONTHLY[kind];
  const query = useQuery({ queryKey: listKey(kind), queryFn: () => getJson<MonthlyItem[]>(text.path) });

  return (
    <QueryState query={query} errorTitle={`No se pudo cargar el ${text.noun}.`}>
      {(items) => {
        const item = items.find((i) => String(i.id) === id);
        if (item === undefined) {
          return (
            <View style={styles.missing}>
              <Text style={styles.muted}>Este {text.noun} ya no existe.</Text>
            </View>
          );
        }
        return <MonthlyForm key={item.id} kind={kind} item={item} />;
      }}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  muted: { color: colors.textMuted },
});
