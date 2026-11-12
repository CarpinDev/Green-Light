import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { Product } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { invalidateProducts } from '@/products/invalidate';
import { colors, space, type } from '@/theme/tokens';

const KIND_LABEL = { credit_card: 'Tarjeta', account: 'Cuenta', loan: 'Préstamo' } as const;

/** Los productos archivados, cada uno con su botón para desarchivarlo. */
export default function Archived() {
  const archived = useQuery({
    queryKey: ['products', 'archived'],
    queryFn: () => getJson<Product[]>('/products?archived=true'),
  });

  return (
    <QueryState
      query={archived}
      errorTitle="No se pudieron cargar los archivados."
      emptyText="No tienes nada archivado."
    >
      {(data) => (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.list}>
            {data.map((product) => (
              <ArchivedRow key={product.id} product={product} />
            ))}
          </Card>
        </ScrollView>
      )}
    </QueryState>
  );
}

function ArchivedRow({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const unarchive = useMutation({
    mutationFn: () => postJson<{ id: number }>(`/products/${product.id}/unarchive`, {}),
    onSuccess: () => invalidateProducts(queryClient),
  });

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name} <Text style={styles.muted}>····{product.last4}</Text>
          </Text>
          <Text style={styles.muted}>
            {KIND_LABEL[product.kind]} · {product.bank}
          </Text>
        </View>
        <Button
          label={unarchive.isPending ? 'Desarchivando…' : 'Desarchivar'}
          variant="secondary"
          loading={unarchive.isPending}
          onPress={() => unarchive.mutate()}
        />
      </View>
      {unarchive.isError && <Text style={styles.error}>{errorText(unarchive.error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  list: { paddingVertical: space.xs },
  row: { gap: space.xs, paddingVertical: space.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  main: { flex: 1, gap: 2 },
  name: type.bodyMedium,
  muted: { ...type.caption, color: colors.textMuted },
  error: { color: colors.danger },
});
