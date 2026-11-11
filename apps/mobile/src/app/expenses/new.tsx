import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { Category, Product } from '@/api/types';
import { Label } from '@/components/label';
import { Options } from '@/components/options';
import { today } from '@/dates';
import { parsePesos } from '@/money';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export default function NewExpense() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
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

  // Un préstamo no es de donde sale un gasto: solo cuentas y tarjetas
  const sources = (products.data ?? []).filter((p) => p.kind !== 'loan');
  const selected = sources.find((p) => p.id === productId);
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
    const amountCents = parsePesos(amount);
    if (amountCents === null || amountCents === 0) return setFormError('Escribe un monto válido, solo números (ej. 120.000).');
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
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="120.000"
        keyboardType="numeric"
      />

      <Label>Fecha</Label>
      <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" autoCapitalize="none" />

      <Label>De dónde sale</Label>
      {products.isPending ? (
        <ActivityIndicator />
      ) : products.isError ? (
        <Text style={styles.error}>No se pudieron cargar tus cuentas y tarjetas.</Text>
      ) : sources.length === 0 ? (
        <Text style={styles.muted}>Todavía no tienes cuentas ni tarjetas: créalas primero.</Text>
      ) : (
        <Options
          items={sources.map((p) => ({ id: p.id, label: `${p.name} ····${p.last4}` }))}
          selected={productId}
          onSelect={setProductId}
        />
      )}

      {isCard && (
        <>
          <Label>Cuotas</Label>
          <TextInput
            style={styles.input}
            value={installments}
            onChangeText={setInstallments}
            placeholder="1 a 72"
            keyboardType="numeric"
          />
        </>
      )}

      <Label>Categoría (opcional)</Label>
      {categories.isPending ? (
        <ActivityIndicator />
      ) : categories.isError ? (
        <Text style={styles.error}>No se pudieron cargar las categorías.</Text>
      ) : categories.data.length === 0 ? (
        <Text style={styles.muted}>No hay categorías de gasto todavía.</Text>
      ) : (
        <Options
          items={categories.data.map((c) => ({ id: c.id, label: c.name }))}
          selected={categoryId}
          // Tocar la elegida otra vez la quita: la categoría es opcional
          onSelect={(id) => setCategoryId(id === categoryId ? null : id)}
        />
      )}

      <Label>Descripción (opcional)</Label>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Mercado" />

      <Pressable
        onPress={submit}
        disabled={create.isPending}
        style={[styles.button, create.isPending && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{create.isPending ? 'Registrando…' : 'Registrar gasto'}</Text>
      </Pressable>

      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {create.isError && <Text style={styles.error}>{errorText(create.error)}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff' },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#d64545' },
  muted: { color: '#666' },
});
