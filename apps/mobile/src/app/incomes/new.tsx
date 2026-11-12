import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { AccountSummary, Category } from '@/api/types';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { FormScreen } from '@/components/form-screen';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Pills } from '@/components/pills';
import { QueryState } from '@/components/query-state';
import { SelectCard } from '@/components/select-card';
import { Text } from '@/components/text';
import { formatDay, today } from '@/dates';
import { incomeAlreadyInBalance, projectionAsOf, selectedAccountId, validateIncome } from '@/incomes/logic';
import { invalidateProducts } from '@/products/invalidate';
import { colors, space, type } from '@/theme/tokens';

/** Un ingreso puntual: plata que entró a una cuenta (prima, venta, transferencia). No es "confirmar saldo". */
export default function NewIncome() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [pickedAccount, setPickedAccount] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => getJson<AccountSummary[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories', 'income'],
    queryFn: () => getJson<Category[]>('/categories?kind=income'),
  });

  const list = accounts.data ?? [];
  // Con una sola cuenta viene elegida; con varias, la que toque el usuario
  const accountId = selectedAccountId(list, pickedAccount);
  const account = list.find((a) => a.id === accountId);
  const asOf = projectionAsOf(list);
  const alreadyIn = account !== undefined && incomeAlreadyInBalance(date, asOf);
  const expected = date > today();

  const create = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>('/one-off-incomes', body),
    onSuccess: () => {
      // El ingreso cambia el saldo de la cuenta y la proyección: se marcan viejos y se piden de nuevo
      invalidateProducts(queryClient);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    },
  });

  const submit = () => {
    const error = validateIncome({ amountCents, accountId, date });
    if (error !== null || amountCents === null || accountId === null) return setFormError(error);

    setFormError(null);
    create.mutate({
      date,
      amountCents,
      destinationAccountId: accountId,
      ...(description.trim() !== '' && { description: description.trim() }),
      ...(categoryId !== null && { categoryId }),
    });
  };

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
          <Button
            label={create.isPending ? 'Registrando…' : 'Registrar ingreso'}
            loading={create.isPending}
            onPress={submit}
          />
        </>
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>¿Cuánto te entró?</Text>
        <MoneyInput large value={amountCents} onChangeCents={setAmountCents} placeholder="$ 0" style={styles.amount} />
      </View>

      <Text style={styles.hint}>
        Esto es plata que llegó a tu cuenta. Si solo quieres corregir lo que dice el banco, confirma el saldo en{' '}
        <Link href="/products" style={styles.link}>
          Productos
        </Link>
        .
      </Text>

      <Label>A qué cuenta entró</Label>
      <QueryState
        inline
        query={accounts}
        errorTitle="No se pudieron cargar tus cuentas."
        emptyText="Primero necesitas una cuenta para registrar un ingreso."
      >
        {(data) =>
          data.length === 0 ? (
            <Card style={styles.empty}>
              <Text style={styles.muted}>Primero necesitas una cuenta para registrar un ingreso.</Text>
              <Link href="/accounts/new" asChild>
                <Button label="Agregar cuenta" />
              </Link>
            </Card>
          ) : (
            <View style={styles.cards}>
              {data.map((a) => (
                <SelectCard
                  key={a.id}
                  title={a.name}
                  detail={`····${a.last4}`}
                  selected={a.id === accountId}
                  onPress={() => setPickedAccount(a.id)}
                />
              ))}
            </View>
          )
        }
      </QueryState>

      <Label>Cuándo</Label>
      <DateField value={date} onChange={setDate} />
      {expected && <Text style={styles.hint}>Es una fecha futura: lo cuento como ingreso esperado.</Text>}

      {alreadyIn && account !== undefined && asOf !== null && (
        <Banner action={{ label: 'Confirmar saldo en Productos', href: '/products' }}>
          Tu proyección parte del saldo confirmado el {formatDay(asOf)}, y este ingreso es anterior. Si ya estaba en ese
          saldo, no cambia tu proyección. Si llegó después, confirma de nuevo el saldo de {account.name}.
        </Banner>
      )}

      <Label>Descripción (opcional)</Label>
      <Input value={description} onChangeText={setDescription} placeholder="Prima, venta, transferencia…" />

      {/* Sin categorías de ingreso, el campo sobra */}
      {(categories.data?.length ?? 0) > 0 && (
        <>
          <Label>Categoría (opcional)</Label>
          <Pills
            items={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            selected={categoryId}
            // Tocar la elegida otra vez la quita: la categoría es opcional
            onSelect={(id) => setCategoryId(id === categoryId ? null : id)}
          />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  heroLabel: { ...type.caption, color: colors.textMuted },
  amount: { textAlign: 'center', alignSelf: 'stretch' },
  hint: { color: colors.textMuted, fontSize: 13 },
  link: { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },
  muted: { ...type.caption, color: colors.textMuted },
  empty: { gap: space.md },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  error: { color: colors.danger },
});
