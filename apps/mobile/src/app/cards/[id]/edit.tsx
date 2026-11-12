import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getJson } from '@/api/client';
import type { CardSummary } from '@/api/types';
import { CardForm } from '@/components/products/card-form';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { colors, space } from '@/theme/tokens';

/** Busca la tarjeta en el listado (la misma consulta de Productos: abre al instante y sirve con la URL directa). */
export default function EditCard() {
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
        return <CardForm key={card.id} card={card} />;
      }}
    </QueryState>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  muted: { color: colors.textMuted },
});
