import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { deleteJson } from '@/api/client';
import { errorText } from '@/api/errors';
import { Text } from '@/components/text';
import { type ConfirmTarget, confirmLabel, confirmParams } from '@/payments/logic';
import { invalidatePayments } from '@/payments/invalidate';
import { colors, space, type } from '@/theme/tokens';

/**
 * "Marcar pagado" (o "Llegó" en un ingreso): abre el modal de confirmación con lo esperado. Un botón de texto, chico,
 * para que quepa debajo de una fila sin competir con ella.
 */
export function ConfirmButton({ target }: { target: ConfirmTarget }) {
  const router = useRouter();
  const label = confirmLabel(target.kind);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${target.name}`}
      hitSlop={8}
      onPress={() => router.push({ pathname: '/confirm-payment', params: confirmParams(target) })}
      style={styles.button}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

/**
 * "Deshacer": borra la confirmación (`path` es `/debt-payments/:id` o `/recurring-confirmations/:id`) y el pago vuelve a
 * ser el supuesto. Si era una tarjeta, su plan y sus abonos se piden de nuevo (el excedente se borra con el pago).
 */
export function UndoButton({ path, cardId }: { path: string; cardId?: number }) {
  const queryClient = useQueryClient();
  const undo = useMutation({
    mutationFn: () => deleteJson(path),
    onSuccess: () => invalidatePayments(queryClient, cardId),
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Deshacer"
        hitSlop={8}
        disabled={undo.isPending}
        onPress={() => undo.mutate()}
        style={styles.button}
      >
        <Text style={styles.undo}>{undo.isPending ? 'Deshaciendo…' : 'Deshacer'}</Text>
      </Pressable>
      {undo.isError && <Text style={styles.error}>{errorText(undo.error)}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', marginTop: space.xs, minHeight: 24, justifyContent: 'center' },
  label: { ...type.captionSmall, color: colors.primary, fontWeight: '700' },
  undo: { ...type.captionSmall, color: colors.textMuted, fontWeight: '700' },
  error: { ...type.captionSmall, color: colors.danger },
});
