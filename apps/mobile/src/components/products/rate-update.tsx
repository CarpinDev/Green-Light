import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { CardSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Label } from '@/components/label';
import { RateField } from '@/components/products/rate-field';
import { Text } from '@/components/text';
import { formatDay, isValidDate, today } from '@/dates';
import { invalidateProducts } from '@/products/invalidate';
import { formatPercent, type RateKind, rateBody } from '@/products/rates';
import { colors, space, type } from '@/theme/tokens';

/** La tasa vigente de la tarjeta y cómo registrar un cambio (las tasas variables cambian mes a mes). */
export function RateUpdate({ card }: { card: CardSummary }) {
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState('');
  const [kind, setKind] = useState<RateKind>('ea');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const add = useMutation({
    mutationFn: (body: object) => postJson<{ id: number }>(`/products/${card.id}/rates`, body),
    onSuccess: () => {
      invalidateProducts(queryClient);
      setPercent('');
      setSaved(true);
    },
  });

  const submit = () => {
    setSaved(false);
    const body = rateBody(percent, kind, effectiveFrom);
    if (body === null) return setFormError('Escribe la tasa como porcentaje menor a 100, por ejemplo 28,99.');
    if (!isValidDate(effectiveFrom)) return setFormError('Elige una fecha válida.');
    setFormError(null);
    add.mutate(body);
  };

  const rate = card.currentRate;

  return (
    <Card style={styles.card}>
      <Text style={type.subtitle}>Actualizar tasa</Text>
      <Text style={styles.muted}>
        {rate === null
          ? 'Esta tarjeta todavía no tiene una tasa vigente.'
          : `Vigente: ${formatPercent(rate.ea)} E.A. · ${formatPercent(rate.mv)} M.V., desde el ${formatDay(rate.effectiveFrom)}.`}
      </Text>

      <Label>Tasa nueva</Label>
      <RateField percent={percent} onChangePercent={setPercent} kind={kind} onChangeKind={setKind} />

      <Label>Rige desde</Label>
      <DateField value={effectiveFrom} onChange={setEffectiveFrom} />

      <Button
        label={add.isPending ? 'Guardando…' : 'Actualizar tasa'}
        variant="secondary"
        loading={add.isPending}
        onPress={submit}
      />
      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {add.isError && <Text style={styles.error}>{errorText(add.error)}</Text>}
      {saved && !add.isPending && <Text style={styles.ok}>Tasa guardada.</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, marginTop: space.xl },
  muted: { ...type.caption, color: colors.textMuted },
  error: { color: colors.danger },
  ok: { color: colors.primary },
});
