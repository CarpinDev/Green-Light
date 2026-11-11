import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { Category, Product } from '@/api/types';
import { Button } from '@/components/button';
import { ChoiceButtons } from '@/components/choice-buttons';
import { DateField } from '@/components/date-field';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Pills } from '@/components/pills';
import { QueryState } from '@/components/query-state';
import { SelectCard } from '@/components/select-card';
import { Text } from '@/components/text';
import { isValidDate, today, yesterday } from '@/dates';
import { colors, space, type } from '@/theme/tokens';

type DateChoice = 'today' | 'yesterday' | 'other';
/** Las cuotas más comunes; "Otra" abre un campo para escribir cualquier número. */
type InstallmentChoice = 1 | 3 | 6 | 12 | 'other';

const DATE_ITEMS: { value: DateChoice; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'other', label: 'Otra fecha' },
];

const INSTALLMENT_ITEMS: { value: InstallmentChoice; label: string }[] = [
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 6, label: '6' },
  { value: 12, label: '12' },
  { value: 'other', label: 'Otra' },
];

/** Un préstamo no es de donde sale un gasto: solo cuentas y tarjetas. */
const sourcesOf = (products: Product[]) => products.filter((p) => p.kind !== 'loan');

export default function NewExpense() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bottom } = useSafeAreaInsets();

  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [installmentChoice, setInstallmentChoice] = useState<InstallmentChoice>(1);
  const [otherInstallments, setOtherInstallments] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice>('today');
  const [otherDate, setOtherDate] = useState(today());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
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
    onSuccess: () => {
      // El gasto cambia la proyección: se marca vieja y el inicio (que sigue montado bajo el modal) la
      // vuelve a pedir. No se espera a que termine: el modal se cierra ya y el inicio muestra "refrescando".
      void queryClient.invalidateQueries({ queryKey: ['projection'] });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    },
  });

  const submit = () => {
    const date = dateChoice === 'today' ? today() : dateChoice === 'yesterday' ? yesterday() : otherDate;

    if (amountCents === null || amountCents === 0) return setFormError('Escribe el monto del gasto (ej. 120.000).');
    if (selected === undefined) return setFormError('Elige de dónde sale el gasto.');
    if (!isValidDate(date)) return setFormError('Elige una fecha válida.');

    let cuotas: number | undefined;
    if (isCard) {
      cuotas = installmentChoice === 'other' ? Number(otherInstallments) : installmentChoice;
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>¿Cuánto gastaste?</Text>
          <MoneyInput
            large
            value={amountCents}
            onChangeCents={setAmountCents}
            placeholder="$ 0"
            style={styles.amount}
          />
        </View>

        <Label>De dónde sale</Label>
        <QueryState
          inline
          query={products}
          errorTitle="No se pudieron cargar tus cuentas y tarjetas."
          emptyText="Todavía no tienes cuentas ni tarjetas: créalas primero."
          isEmpty={(data) => sourcesOf(data).length === 0}
        >
          {(data) => (
            <View style={styles.cards}>
              {sourcesOf(data).map((p) => (
                <SelectCard
                  key={p.id}
                  title={p.name}
                  detail={p.kind === 'credit_card' ? `····${p.last4} · tarjeta` : `····${p.last4}`}
                  selected={p.id === productId}
                  onPress={() => setProductId(p.id)}
                />
              ))}
            </View>
          )}
        </QueryState>

        {isCard && (
          <>
            <Label>Cuotas</Label>
            <ChoiceButtons items={INSTALLMENT_ITEMS} selected={installmentChoice} onSelect={setInstallmentChoice} />
            {installmentChoice === 'other' && (
              <Input
                value={otherInstallments}
                onChangeText={setOtherInstallments}
                placeholder="1 a 72"
                keyboardType="number-pad"
              />
            )}
          </>
        )}

        <Label>Cuándo</Label>
        <Pills items={DATE_ITEMS} selected={dateChoice} onSelect={setDateChoice} />
        {dateChoice === 'other' && <DateField value={otherDate} onChange={setOtherDate} />}

        <Label>Categoría (opcional)</Label>
        <QueryState
          inline
          query={categories}
          errorTitle="No se pudieron cargar las categorías."
          emptyText="No hay categorías de gasto todavía."
        >
          {(data) => (
            <Pills
              items={data.map((c) => ({ value: c.id, label: c.name }))}
              selected={categoryId}
              // Tocar la elegida otra vez la quita: la categoría es opcional
              onSelect={(id) => setCategoryId(id === categoryId ? null : id)}
            />
          )}
        </QueryState>

        <Label>Descripción (opcional)</Label>
        <Input value={description} onChangeText={setDescription} placeholder="Mercado" />
      </ScrollView>

      {/* Fijo abajo: el botón siempre está a la vista, sin importar cuánto se desplace el formulario */}
      <View style={[styles.footer, { paddingBottom: Math.max(bottom, space.lg) }]}>
        {formError !== null && <Text style={styles.error}>{formError}</Text>}
        {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
        <Button
          label={create.isPending ? 'Registrando…' : 'Registrar gasto'}
          loading={create.isPending}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, gap: space.sm, maxWidth: 640, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  heroLabel: { ...type.caption, color: colors.textMuted },
  amount: { textAlign: 'center', alignSelf: 'stretch' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
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
