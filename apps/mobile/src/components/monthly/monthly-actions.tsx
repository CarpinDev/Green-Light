import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteJson, patchJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Text } from '@/components/text';
import { formatDay, isValidDate, today } from '@/dates';
import { listKey, MONTHLY, type MonthlyItem, type MonthlyKind } from '@/monthly/kinds';
import { terminationDate } from '@/monthly/logic';
import { formatCop } from '@/money';
import { colors, space, type } from '@/theme/tokens';

interface MonthlyActionsProps {
  kind: MonthlyKind;
  item: MonthlyItem;
}

/**
 * Lo que se hace con un registro además de editarlo: cambiar el monto desde una fecha, terminarlo
 * (o reactivarlo) y borrarlo. Cada acción es su propia mutación; al terminar, todas vuelven a la lista.
 */
export function MonthlyActions({ kind, item }: MonthlyActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const text = MONTHLY[kind];
  const url = `${text.path}/${item.id}`;

  const [changing, setChanging] = useState(false);
  const [newAmount, setNewAmount] = useState<number | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const done = () => {
    // El semáforo de Inicio se recalcula y la lista se refresca; el registro ya cambió, esta pantalla sobra
    void queryClient.invalidateQueries({ queryKey: ['projection'] });
    void queryClient.invalidateQueries({ queryKey: ['movements'] });
    void queryClient.invalidateQueries({ queryKey: listKey(kind) });
    if (router.canGoBack()) router.back();
    else router.replace('/monthly');
  };

  const changeAmount = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>(`${url}/amount-changes`, body),
    onSuccess: done,
  });
  const setEnd = useMutation({
    mutationFn: (endDate: string) => patchJson<{ id: number }>(url, { endDate }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => deleteJson(url), onSuccess: done });

  const busy = changeAmount.isPending || setEnd.isPending || remove.isPending;
  const error = changeAmount.error ?? setEnd.error ?? remove.error;

  const submitChange = () => {
    if (newAmount === null || newAmount === 0) return setFormError('Escribe el monto nuevo.');
    if (!isValidDate(effectiveFrom)) return setFormError('Elige una fecha válida.');
    setFormError(null);
    changeAmount.mutate({ amountCents: newAmount, effectiveFrom });
  };

  return (
    <View style={styles.wrap}>
      {item.status === 'upcoming' && <Text style={styles.status}>Empieza el {formatDay(item.startDate)}.</Text>}
      {item.status === 'active' && item.endDate !== null && (
        <Text style={styles.status}>Termina el {formatDay(item.endDate)}.</Text>
      )}
      {item.status === 'ended' && item.endDate !== null && (
        <Text style={styles.status}>
          Terminó el {formatDay(item.endDate)}. Un {text.noun} terminado no se reactiva: para retomarlo, crea uno nuevo.
        </Text>
      )}

      {item.status !== 'ended' && (
        <Card style={styles.card}>
          <Text style={type.subtitle}>Cambiar monto</Text>
          <Text style={styles.muted}>
            {item.status === 'upcoming'
              ? `Empieza en ${formatCop(item.amountCents)}.`
              : `Hoy es ${formatCop(item.amountCents)}.`}{' '}
            El monto nuevo rige desde la fecha que elijas: los meses anteriores no cambian.
          </Text>
          {changing ? (
            <>
              <Label>Monto nuevo</Label>
              <MoneyInput value={newAmount} onChangeCents={setNewAmount} placeholder="$ 0" />
              <Label>Desde cuándo</Label>
              <DateField value={effectiveFrom} onChange={setEffectiveFrom} />
              <Button
                label={changeAmount.isPending ? 'Aplicando…' : 'Aplicar cambio'}
                loading={changeAmount.isPending}
                disabled={busy}
                onPress={submitChange}
              />
            </>
          ) : (
            <Button label="Cambiar monto" variant="secondary" disabled={busy} onPress={() => setChanging(true)} />
          )}
        </Card>
      )}

      {item.status === 'active' && (
        <Button
          label={setEnd.isPending ? 'Terminando…' : 'Terminar'}
          variant="secondary"
          disabled={busy}
          onPress={() => setEnd.mutate(terminationDate(item.startDate))}
        />
      )}

      {confirmingDelete ? (
        <Card style={styles.card}>
          <Text style={type.subtitle}>¿Eliminar este {text.noun}?</Text>
          <Text style={styles.muted}>
            Solo si lo creaste por error: se borra del todo y desaparece también de los meses pasados. Para dejar de
            contarlo desde hoy, usa Terminar.
          </Text>
          <Button
            label={remove.isPending ? 'Eliminando…' : 'Sí, eliminar'}
            loading={remove.isPending}
            disabled={busy}
            onPress={() => remove.mutate()}
          />
          <Button
            label="No, conservar"
            variant="secondary"
            disabled={busy}
            onPress={() => setConfirmingDelete(false)}
          />
        </Card>
      ) : (
        <Button label="Eliminar" variant="secondary" disabled={busy} onPress={() => setConfirmingDelete(true)} />
      )}

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {error !== null && <Text style={styles.error}>{errorText(error)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, marginTop: space.xl },
  card: { gap: space.sm },
  status: { color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted },
  error: { color: colors.danger },
});
