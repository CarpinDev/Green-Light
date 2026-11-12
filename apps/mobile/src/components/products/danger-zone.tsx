import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteJson, getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { ProductKind, ProductUsage } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Text } from '@/components/text';
import { archiveWarning, blockerLine, usageSummary } from '@/products/lifecycle';
import { invalidateProducts } from '@/products/invalidate';
import { colors, space, type } from '@/theme/tokens';

interface DangerZoneProps {
  productId: number;
  kind: ProductKind;
  /** El saldo de una cuenta, para avisar que dejará de contar al archivarla. */
  balanceCents?: number | null;
}

type Dialog = 'archive' | 'delete' | null;

const NOUN: Record<ProductKind, { the: string; this: string }> = {
  credit_card: { the: 'la tarjeta', this: 'esta tarjeta' },
  account: { the: 'la cuenta', this: 'esta cuenta' },
  loan: { the: 'el préstamo', this: 'este préstamo' },
};

/**
 * "Zona de peligro" de un producto: archivarlo (lo saca de las listas y de la proyección, pero conserva el
 * historial) o eliminarlo con todo lo suyo. Los dos piden confirmación; al terminar se vuelve a Productos.
 */
export function DangerZone({ productId, kind, balanceCents = null }: DangerZoneProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  // Lo que se borraría y lo que bloquea: solo se pide cuando se abre el diálogo de eliminar
  const usage = useQuery({
    queryKey: ['products', productId, 'usage'],
    queryFn: () => getJson<ProductUsage>(`/products/${productId}/usage`),
    enabled: dialog === 'delete',
    gcTime: 0,
  });

  const finish = () => {
    invalidateProducts(queryClient);
    setDialog(null);
    router.replace('/products');
  };

  const archive = useMutation({
    mutationFn: () => postJson<{ id: number }>(`/products/${productId}/archive`, {}),
    onSuccess: finish,
  });
  const remove = useMutation({
    mutationFn: () => deleteJson(`/products/${productId}`),
    onSuccess: finish,
  });

  const open = (next: Dialog) => {
    archive.reset();
    remove.reset();
    setDialog(next);
  };

  const warning = archiveWarning(kind, balanceCents);
  const blockers = usage.data?.blockers ?? [];
  const blocked = blockers.length > 0;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Zona de peligro</Text>
      <Card style={styles.card}>
        <Text style={styles.muted}>
          Archivar lo saca de tus listas y de la proyección, pero conserva su historial. Eliminar lo borra con todo lo
          suyo.
        </Text>
        <Button label="Archivar" variant="secondary" onPress={() => open('archive')} />
        <Button label="Eliminar" variant="danger" onPress={() => open('delete')} />
      </Card>

      <ConfirmDialog
        visible={dialog === 'archive'}
        title={`¿Archivar ${NOUN[kind].this}?`}
        confirmLabel="Archivar"
        loading={archive.isPending}
        error={archive.isError ? errorText(archive.error) : null}
        onConfirm={() => archive.mutate()}
        onCancel={() => setDialog(null)}
      >
        <Text style={styles.body}>Saldrá de tus listas y de la proyección. Podrás desarchivar desde Productos.</Text>
        {warning !== null && <Text style={styles.warning}>{warning}</Text>}
      </ConfirmDialog>

      <ConfirmDialog
        visible={dialog === 'delete'}
        title={`¿Eliminar ${NOUN[kind].the}?`}
        confirmLabel="Eliminar"
        confirmVariant="danger"
        hideConfirm={blocked || usage.isError}
        loading={remove.isPending}
        error={remove.isError ? errorText(remove.error) : usage.isError ? errorText(usage.error) : null}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDialog(null)}
      >
        {usage.isPending && <Text style={styles.body}>Revisando qué se borraría…</Text>}
        {usage.data !== undefined && !blocked && <Text style={styles.body}>{usageSummary(usage.data)}</Text>}
        {blocked && (
          <>
            <Text style={styles.body}>No se puede eliminar todavía. Resuelve esto primero:</Text>
            {blockers.map((blocker) => (
              <Text key={`${blocker.kind}-${blocker.id}`} style={styles.item}>
                · {blockerLine(blocker)}
              </Text>
            ))}
          </>
        )}
      </ConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  title: { ...type.title, color: colors.danger },
  card: { gap: space.sm },
  muted: { ...type.caption, color: colors.textMuted },
  body: type.body,
  item: { ...type.body, color: colors.textMuted },
  warning: { ...type.body, color: colors.danger },
});
