import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { CardPlan, PlanCut, StatementCheckResponse } from '@/api/types';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Text } from '@/components/text';
import { formatDay, today } from '@/dates';
import { formatCop } from '@/money';
import { checkVerdict, comparableCut } from '@/products/plan';
import { colors, light, space, type } from '@/theme/tokens';

/**
 * "Comparar con mi extracto": el mínimo que calcula Green Light para el extracto que ya cerró, contra el que dice
 * tu banco. La API solo valida un corte que ya llegó, así que se compara el primero del plan si ya cerró.
 */
export function StatementCompare({ cardId }: { cardId: number }) {
  // La misma consulta del plan de pagos: comparte caché, no se vuelve a pedir
  const plan = useQuery({
    queryKey: ['cards', cardId, 'plan'],
    queryFn: () => getJson<CardPlan>(`/cards/${cardId}/plan?cuts=6`),
  });
  // El plan que falló o carga ya lo avisa la sección del plan
  if (plan.data === undefined) return null;
  return <Compare cardId={cardId} cuts={plan.data.cuts} />;
}

function Compare({ cardId, cuts }: { cardId: number; cuts: readonly PlanCut[] }) {
  const cut = comparableCut(cuts, today());
  const [bankCents, setBankCents] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: (body: object) => postJson<StatementCheckResponse>('/statement-checks', body),
  });

  const submit = () => {
    if (cut === null) return;
    if (bankCents === null) return setFormError('Escribe el pago mínimo que dice tu banco.');
    setFormError(null);
    check.mutate({ cardId, cutDate: cut.cutDate, statementMinimumCents: bankCents });
  };

  const verdict = check.data === undefined ? null : checkVerdict(check.data.check);

  return (
    <Card style={styles.card}>
      <Text style={type.subtitle}>Comparar con mi extracto</Text>

      {cut === null ? (
        <Text style={styles.muted}>
          {cuts[0] === undefined
            ? 'Todavía no hay un corte para comparar.'
            : `Tu próximo corte es el ${formatDay(cuts[0].cutDate)}. Cuando te llegue el extracto podrás compararlo aquí.`}
        </Text>
      ) : (
        <>
          <Text style={styles.muted}>
            Corte del {formatDay(cut.cutDate)} (pago el {formatDay(cut.dueDate)}). Green Light espera un mínimo de{' '}
            <Text style={styles.strong}>{formatCop(cut.minimum.total)}</Text>.
          </Text>

          <Text style={styles.muted}>
            Usa el pago mínimo del extracto ya cerrado (el PDF). Algunos bancos muestran en la app un mínimo estimado
            sin intereses, y ese no sirve para comparar.
          </Text>

          <Label>Mínimo que dice tu banco</Label>
          <MoneyInput value={bankCents} onChangeCents={setBankCents} placeholder="$ 0" />
          <Button
            label={check.isPending ? 'Comparando…' : 'Comparar'}
            variant="secondary"
            loading={check.isPending}
            onPress={submit}
          />

          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {check.isError && <Text style={styles.error}>{errorText(check.error)}</Text>}
          {verdict !== null && !check.isPending && (
            <>
              <Text style={verdict.within ? styles.good : styles.warn}>{verdict.headline}</Text>
              <Text style={styles.muted}>{verdict.advice}</Text>
            </>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  muted: { ...type.caption, color: colors.textMuted },
  strong: { ...type.caption, color: colors.text, fontWeight: '700' },
  error: { color: colors.danger },
  good: { color: light.green.bg },
  warn: { color: light.yellow.bg },
});
