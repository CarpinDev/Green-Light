import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { deleteJson, getJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { CapitalPaymentItem } from '@/api/types';
import { Card } from '@/components/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatDay } from '@/dates';
import { formatCop } from '@/money';
import { invalidateProducts } from '@/products/invalidate';
import { modeLabel, sourceLabel } from '@/products/payment';
import { colors, space, type } from '@/theme/tokens';

/** "Abonos registrados" de una tarjeta, con un botón para quitar uno mal puesto (con confirmación). */
export function PaymentsList({ cardId }: { cardId: number }) {
  const payments = useQuery({
    queryKey: ['cards', cardId, 'capital-payments'],
    queryFn: () => getJson<CapitalPaymentItem[]>(`/cards/${cardId}/capital-payments`),
  });
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<CapitalPaymentItem | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => deleteJson(`/capital-payments/${id}`),
    onSuccess: () => {
      // Sin el abono, el plan, la proyección y el saldo se recalculan solos
      invalidateProducts(queryClient);
      setRemoving(null);
    },
  });

  return (
    <View style={styles.section}>
      <Text style={type.title}>Abonos registrados</Text>
      <QueryState
        inline
        query={payments}
        errorTitle="No se pudieron cargar los abonos."
        emptyText="Todavía no has abonado a esta tarjeta."
      >
        {(data) => (
          <Card style={styles.list}>
            {data.map((payment) => (
              <View key={payment.id} style={styles.row}>
                <View style={styles.main}>
                  <Text style={styles.amount}>{formatCop(payment.amountCents)}</Text>
                  <Text style={styles.muted}>
                    {[formatDay(payment.date), sourceLabel(payment.source), modeLabel(payment.mode)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar el abono de ${formatCop(payment.amountCents)}`}
                  hitSlop={8}
                  onPress={() => {
                    remove.reset();
                    setRemoving(payment);
                  }}
                >
                  <Text style={styles.remove}>Eliminar</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </QueryState>

      <ConfirmDialog
        visible={removing !== null}
        title="¿Eliminar este abono?"
        confirmLabel="Eliminar"
        confirmVariant="danger"
        loading={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onConfirm={() => removing !== null && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      >
        {removing !== null && (
          <Text style={type.body}>
            Se quita el abono de {formatCop(removing.amountCents)} del {formatDay(removing.date)}: tu deuda vuelve a
            donde estaba y el plan se recalcula.
          </Text>
        )}
      </ConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  list: { paddingVertical: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  main: { flex: 1, gap: 2 },
  amount: type.bodyMedium,
  muted: { ...type.caption, color: colors.textMuted },
  remove: { color: colors.danger, fontWeight: '700' },
});
