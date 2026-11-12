import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getJson, patchJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary, Category, FixedExpense, Product, RecurringIncome } from '@/api/types';
import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { MonthlyActions } from '@/components/monthly/monthly-actions';
import { Pills } from '@/components/pills';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { isValidDate, today } from '@/dates';
import { listKey, MONTHLY, type MonthlyItem, type MonthlyKind } from '@/monthly/kinds';
import { parseDayOfMonth } from '@/monthly/logic';
import { type ExpenseSource, sourceBody, sourceOf } from '@/monthly/source';
import { formatCop } from '@/money';
import { colors, space } from '@/theme/tokens';

interface MonthlyFormProps {
  kind: MonthlyKind;
  /** Con un registro es la edición; sin él, la creación. */
  item?: MonthlyItem;
}

/** Lo que se elige entre pastillas (cuenta, tarjeta, categoría): tocar la elegida otra vez la quita. */
type Choice = { value: number; label: string };

/** El formulario de crear o editar un ingreso recurrente o un gasto fijo. */
export function MonthlyForm({ kind, item }: MonthlyFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bottom } = useSafeAreaInsets();
  const text = MONTHLY[kind];
  const editing = item !== undefined;

  // El ingreso llega a una cuenta; el gasto fijo sale de una cuenta o de una tarjeta (o de ninguna)
  const initialTarget = editing && kind === 'income' ? (item as RecurringIncome).destinationAccountId : null;
  const initialSource: ExpenseSource = editing && kind === 'expense' ? sourceOf(item as FixedExpense) : null;
  const initialCategory = editing && kind === 'expense' ? (item as FixedExpense).categoryId : null;

  const [name, setName] = useState(item?.name ?? '');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [day, setDay] = useState(item === undefined ? '' : String(item.dayOfMonth));
  const [startDate, setStartDate] = useState(today());
  const [targetId, setTargetId] = useState<number | null>(initialTarget);
  const [source, setSource] = useState<ExpenseSource>(initialSource);
  const [categoryId, setCategoryId] = useState<number | null>(initialCategory);
  const [formError, setFormError] = useState<string | null>(null);

  // Solo se piden las listas que este formulario usa
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => getJson<AccountSummary[]>('/accounts'),
    enabled: kind === 'income',
  });
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => getJson<Product[]>('/products'),
    enabled: kind === 'expense',
  });
  const categories = useQuery({
    queryKey: ['categories', 'expense'],
    queryFn: () => getJson<Category[]>('/categories?kind=expense'),
    enabled: kind === 'expense',
  });

  const save = useMutation({
    mutationFn: (body: object) =>
      editing ? patchJson<{ id: number }>(`${text.path}/${item.id}`, body) : postJson<{ id: number }>(text.path, body),
    onSuccess: () => {
      // El semáforo de Inicio se recalcula y la lista de Mensual se refresca
      void queryClient.invalidateQueries({ queryKey: ['projection'] });
      // Lo programado también sale en los movimientos recientes
      void queryClient.invalidateQueries({ queryKey: ['movements'] });
      void queryClient.invalidateQueries({ queryKey: listKey(kind) });
      if (router.canGoBack()) router.back();
      else router.replace('/monthly');
    },
  });

  const submit = () => {
    const dayOfMonth = parseDayOfMonth(day);
    if (name.trim() === '') return setFormError('Ponle un nombre.');
    if (!editing && (amountCents === null || amountCents === 0)) return setFormError('Escribe el monto mensual.');
    if (dayOfMonth === null) return setFormError('El día del mes va de 1 a 31.');
    if (!editing && !isValidDate(startDate)) return setFormError('Elige una fecha de inicio válida.');

    setFormError(null);

    if (editing) {
      // Solo lo que cambió: mandar de nuevo una tarjeta ya desactivada daría error sin que el usuario la tocara.
      // null quita la cuenta, la tarjeta o la categoría; el origen de un gasto fijo limpia el otro tipo (ver sourceBody)
      save.mutate({
        ...(name.trim() !== item.name && { name: name.trim() }),
        ...(dayOfMonth !== item.dayOfMonth && { dayOfMonth }),
        ...(kind === 'income'
          ? targetId !== initialTarget && { destinationAccountId: targetId }
          : sourceBody(source, initialSource)),
        ...(categoryId !== initialCategory && { categoryId }),
      });
      return;
    }

    save.mutate({
      name: name.trim(),
      amountCents,
      dayOfMonth,
      startDate,
      ...(kind === 'income' ? targetId !== null && { destinationAccountId: targetId } : sourceBody(source)),
      ...(categoryId !== null && { categoryId }),
    });
  };

  const toggle = (current: number | null, set: (id: number | null) => void) => (id: number) =>
    set(id === current ? null : id);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Label>Nombre</Label>
        <Input value={name} onChangeText={setName} placeholder={kind === 'income' ? 'Salario' : 'Arriendo'} />

        {editing ? (
          <>
            <Label>Monto mensual</Label>
            <Text style={styles.readonly}>{formatCop(item.amountCents)}</Text>
          </>
        ) : (
          <>
            <Label>Monto mensual</Label>
            <MoneyInput value={amountCents} onChangeCents={setAmountCents} placeholder="$ 0" />
          </>
        )}

        <Label>Día del mes (1 a 31)</Label>
        <Input value={day} onChangeText={setDay} placeholder="30" keyboardType="number-pad" maxLength={2} />

        {!editing && (
          <>
            <Label>Desde cuándo</Label>
            <DateField value={startDate} onChange={setStartDate} />
          </>
        )}

        {kind === 'income' ? (
          <>
            <Label>Cuenta donde llega (opcional)</Label>
            <QueryState inline query={accounts} errorTitle="No se pudieron cargar tus cuentas.">
              {(data) => (
                <Pills
                  items={choices(
                    data.map((a) => ({ value: a.id, label: a.name })),
                    targetId,
                    (item as RecurringIncome | undefined)?.destinationAccountName,
                  )}
                  selected={targetId}
                  onSelect={toggle(targetId, setTargetId)}
                />
              )}
            </QueryState>
          </>
        ) : (
          <>
            <Label>¿De dónde sale?</Label>
            <QueryState inline query={products} errorTitle="No se pudieron cargar tus cuentas y tarjetas.">
              {(data) => {
                const expense = item as FixedExpense | undefined;
                // Los ids de cuenta y de tarjeta son de producto, así que no se repiten entre los dos grupos.
                // Una cuenta o tarjeta ya desactivada se sigue mostrando si es la que tiene el registro.
                const accountItems = choices(
                  data.filter((p) => p.kind === 'account').map((p) => ({ value: p.id, label: p.name })),
                  initialSource?.kind === 'account' ? initialSource.id : null,
                  expense?.accountName,
                );
                const cardItems = choices(
                  data.filter((p) => p.kind === 'credit_card').map((p) => ({ value: p.id, label: p.name })),
                  initialSource?.kind === 'card' ? initialSource.id : null,
                  expense?.cardName,
                );
                const pick = (next: NonNullable<ExpenseSource>['kind']) => (id: number) =>
                  setSource(source?.kind === next && source.id === id ? null : { kind: next, id });
                return (
                  <>
                    {accountItems.length > 0 && (
                      <>
                        <Text style={styles.group}>Cuentas</Text>
                        <Pills
                          items={accountItems}
                          selected={source?.kind === 'account' ? source.id : null}
                          onSelect={pick('account')}
                        />
                      </>
                    )}
                    {cardItems.length > 0 && (
                      <>
                        <Text style={styles.group}>Tarjetas</Text>
                        <Pills
                          items={cardItems}
                          selected={source?.kind === 'card' ? source.id : null}
                          onSelect={pick('card')}
                        />
                      </>
                    )}
                  </>
                );
              }}
            </QueryState>
            <Text style={styles.hint}>Si no eliges nada, sale de tu saldo en general.</Text>

            <Label>Categoría (opcional)</Label>
            <QueryState inline query={categories} errorTitle="No se pudieron cargar las categorías.">
              {(data) => (
                <Pills
                  items={data.map((c) => ({ value: c.id, label: c.name }))}
                  selected={categoryId}
                  onSelect={toggle(categoryId, setCategoryId)}
                />
              )}
            </QueryState>
          </>
        )}

        {editing && <MonthlyActions kind={kind} item={item} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottom, space.lg) }]}>
        {formError !== null && <Text style={styles.error}>{formError}</Text>}
        {save.isError && <Text style={styles.error}>{errorText(save.error)}</Text>}
        <Button
          label={save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : `Crear ${text.noun}`}
          loading={save.isPending}
          onPress={submit}
        />
      </View>
    </View>
  );
}

/**
 * Las opciones de la lista y, si lo que tiene el registro ya no está en ella (una tarjeta desactivada),
 * esa también: sin esto la selección actual se vería vacía y parecería que no tiene nada.
 */
function choices(list: Choice[], current: number | null, currentLabel: string | null | undefined): Choice[] {
  if (current === null || list.some((c) => c.value === current)) return list;
  return [...list, { value: current, label: currentLabel ?? `Producto ${current}` }];
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, gap: space.sm, maxWidth: 640, width: '100%', alignSelf: 'center' },
  readonly: { color: colors.text, fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 13 },
  group: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger },
});
