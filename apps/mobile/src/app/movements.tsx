import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { deleteJson, getJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { Movement } from '@/api/types';
import { Button } from '@/components/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MovementRow } from '@/components/movements/movement-row';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { formatCop } from '@/money';
import { deletableExpenseId, groupByDay, movementLabel } from '@/movements/logic';
import { invalidateProducts } from '@/products/invalidate';
import { colors, space, type } from '@/theme/tokens';

/** Todos los movimientos que ya pasaron (hasta 100), agrupados por día. */
export default function Movements() {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<Movement | null>(null);
  const movements = useQuery({
    queryKey: ['movements', { limit: 100 }],
    queryFn: () => getJson<Movement[]>('/movements?limit=100'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteJson(`/expenses/${id}`),
    onSuccess: () => {
      // Sin el gasto, la lista, la proyección y la deuda de la tarjeta se recalculan solas
      invalidateProducts(queryClient);
      setRemoving(null);
    },
  });
  const removingId = removing === null ? null : deletableExpenseId(removing);

  return (
    <>
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
                    <MovementRow
                      key={movement.id}
                      movement={movement}
                      showDate={false}
                      onDelete={
                        deletableExpenseId(movement) === null
                          ? undefined
                          : () => {
                              remove.reset();
                              setRemoving(movement);
                            }
                      }
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )
        }
      </QueryState>
      <ConfirmDialog
        visible={removing !== null}
        title="¿Eliminar este gasto?"
        confirmLabel="Eliminar"
        confirmVariant="danger"
        loading={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onConfirm={() => removingId !== null && remove.mutate(removingId)}
        onCancel={() => setRemoving(null)}
      >
        {removing !== null && (
          <Text style={type.body}>
            Se quita {movementLabel(removing)} por {formatCop(removing.amountCents)}: tu saldo, tus deudas y la
            proyección se recalculan sin él.
          </Text>
        )}
      </ConfirmDialog>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  group: { gap: space.md },
  day: { ...type.caption, color: colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', padding: space.xxl, gap: space.md },
  muted: { ...type.caption, color: colors.textMuted },
});
