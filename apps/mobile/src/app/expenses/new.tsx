import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { Category, Product } from '@/api/types';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Options } from '@/components/options';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { colors } from '@/theme/tokens';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Un préstamo no es de donde sale un gasto: solo cuentas y tarjetas. */
const sourcesOf = (products: Product[]) => products.filter((p) => p.kind !== 'loan');

export default function NewExpense() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [productId, setProductId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [installments, setInstallments] = useState('');
  // El error de forma de la propia pantalla; el de la API sale de la mutación
  const [formError, setFormError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ['products'], queryFn: () => getJson<Product[]>('/products') });
  const categories = useQuery({
    queryKey: ['categories', 'expense'],
    queryFn: () => getJson<Category[]>('/categories?kind=expense'),
  });

  const selected = sourcesOf(products.data ?? []).find((p) => p.id === productId);
  const isCard = selected?.kind === 'credit_card';

  const create = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>('/expenses', body),
    onSuccess: async () => {
      // El gasto cambia la proyección: se vuelve a pedir al volver a la pantalla principal
      await queryClient.invalidateQueries({ queryKey: ['projection'] });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    },
  });

  const submit = () => {
    if (amountCents === null || amountCents === 0) return setFormError('Escribe el monto del gasto (ej. 120.000).');
    if (!DATE_FORMAT.test(date)) return setFormError('La fecha va como AAAA-MM-DD (ej. 2026-03-12).');
    if (selected === undefined) return setFormError('Elige de dónde sale el gasto.');

    let cuotas: number | undefined;
    if (isCard) {
      cuotas = Number(installments);
      if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 72) {
        return setFormError('Con una tarjeta las cuotas son obligatorias: un número de 1 a 72.');
      }
    }

    setFormError(null);
    create.mutate({
      date,
      amountCents,
      sourceProductId: selected.id,
      ...(categoryId !== null && { categoryId }),
      ...(description.trim() !== '' && { description: description.trim() }),
      ...(cuotas !== undefined && { installments: cuotas }),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Label>Monto (pesos)</Label>
      <MoneyInput value={amountCents} onChangeCents={setAmountCents} placeholder="$ 120.000" />

      <Label>Fecha</Label>
      <Input value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" autoCapitalize="none" />

      <Label>De dónde sale</Label>
      <QueryState
        inline
        query={products}
        errorTitle="No se pudieron cargar tus cuentas y tarjetas."
        emptyText="Todavía no tienes cuentas ni tarjetas: créalas primero."
        isEmpty={(data) => sourcesOf(data).length === 0}
      >
        {(data) => (
          <Options
            items={sourcesOf(data).map((p) => ({ id: p.id, label: `${p.name} ····${p.last4}` }))}
            selected={productId}
            onSelect={setProductId}
          />
        )}
      </QueryState>

      {isCard && (
        <>
          <Label>Cuotas</Label>
          <Input value={installments} onChangeText={setInstallments} placeholder="1 a 72" keyboardType="number-pad" />
        </>
      )}

      <Label>Categoría (opcional)</Label>
      <QueryState
        inline
        query={categories}
        errorTitle="No se pudieron cargar las categorías."
        emptyText="No hay categorías de gasto todavía."
      >
        {(data) => (
          <Options
            items={data.map((c) => ({ id: c.id, label: c.name }))}
            selected={categoryId}
            // Tocar la elegida otra vez la quita: la categoría es opcional
            onSelect={(id) => setCategoryId(id === categoryId ? null : id)}
          />
        )}
      </QueryState>

      <Label>Descripción (opcional)</Label>
      <Input value={description} onChangeText={setDescription} placeholder="Mercado" />

      <Button
        label={create.isPending ? 'Registrando…' : 'Registrar gasto'}
        loading={create.isPending}
        onPress={submit}
        style={styles.submit}
      />

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  submit: { marginTop: 16 },
  error: { color: colors.danger },
});
