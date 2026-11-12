import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { getJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { CardPlan, OpeningDebtGroup } from '@/api/types';
import { Button } from '@/components/button';
import { DebtGroups } from '@/components/products/debt-groups';
import { QueryState } from '@/components/query-state';
import { Text } from '@/components/text';
import { formatDay, today } from '@/dates';
import {
  type DebtGroupDraft,
  emptyGroup,
  groupsFromApi,
  newGroupKey,
  openingDebtBody,
  validateGroups,
} from '@/products/debt';
import { invalidateProducts } from '@/products/invalidate';
import { pendingStatementCut } from '@/products/plan';
import { colors, space, type } from '@/theme/tokens';

/** "Deuda que ya traías": los grupos guardados de la tarjeta, para corregirlos y volver a guardar. */
export function OpeningDebtSection({ cardId }: { cardId: number }) {
  const saved = useQuery({
    queryKey: ['cards', cardId, 'opening-debt'],
    queryFn: () => getJson<OpeningDebtGroup[]>(`/cards/${cardId}/opening-debt`),
  });

  return (
    <View style={styles.section}>
      <Text style={type.title}>Deuda que ya traías</Text>
      <QueryState inline query={saved} errorTitle="No se pudo cargar la deuda inicial.">
        {(groups) => <Editor cardId={cardId} initial={groups} />}
      </QueryState>
    </View>
  );
}

function Editor({ cardId, initial }: { cardId: number; initial: OpeningDebtGroup[] }) {
  const queryClient = useQueryClient();
  // Sin deuda guardada se empieza con un grupo vacío; con deuda, sus grupos
  const [groups, setGroups] = useState<DebtGroupDraft[]>(() =>
    initial.length > 0 ? groupsFromApi(initial) : [emptyGroup(newGroupKey())],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [statementPaid, setStatementPaid] = useState(false);

  // La misma consulta del plan de pagos (comparte caché): dice si hoy hay un extracto cerrado por pagar
  const plan = useQuery({
    queryKey: ['cards', cardId, 'plan'],
    queryFn: () => getJson<CardPlan>(`/cards/${cardId}/plan?cuts=6`),
  });
  const pending = plan.data === undefined ? null : pendingStatementCut(plan.data.cuts, today());

  const save = useMutation({
    mutationFn: (body: object) => postJson<{ ids: number[] }>(`/cards/${cardId}/opening-debt`, body),
    onSuccess: () => {
      // El plan, la proyección y los movimientos cambian con la deuda
      invalidateProducts(queryClient);
      setSaved(true);
    },
  });

  const submit = () => {
    setSaved(false);
    const body = openingDebtBody(groups, pending !== null && statementPaid);
    if (body === null) return setFormError(validateGroups(groups));
    setFormError(null);
    save.mutate(body);
  };

  return (
    <View style={styles.editor}>
      <DebtGroups
        groups={groups}
        onChange={(next) => {
          setSaved(false);
          setGroups(next);
        }}
      />
      {pending !== null && (
        <View style={styles.paidBox}>
          <View style={styles.paidRow}>
            <Text style={styles.paidLabel}>¿Ya pagaste el extracto del {formatDay(pending.cutDate)}?</Text>
            <Switch
              accessibilityLabel="Ya pagué el último extracto"
              value={statementPaid}
              onValueChange={(value) => {
                setSaved(false);
                setStatementPaid(value);
              }}
              trackColor={{ false: colors.border, true: colors.primarySoft }}
              thumbColor={statementPaid ? colors.primary : colors.textMuted}
            />
          </View>
          <Text style={styles.muted}>
            Si no lo has pagado, cuenta también la cuota de ese extracto en las cuotas que faltan.
          </Text>
        </View>
      )}
      {initial.length > 0 && (
        <Text style={styles.muted}>Al guardar se reemplaza la deuda anterior por estos grupos.</Text>
      )}
      <Button label={save.isPending ? 'Guardando…' : 'Guardar deuda'} loading={save.isPending} onPress={submit} />
      {formError !== null && <Text style={styles.error}>{formError}</Text>}
      {save.isError && <Text style={styles.error}>{errorText(save.error)}</Text>}
      {saved && !save.isPending && <Text style={styles.ok}>Deuda guardada. El plan de pagos ya la cuenta.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  editor: { gap: space.md },
  paidBox: { gap: space.xs },
  paidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  paidLabel: { ...type.bodyMedium, flex: 1 },
  muted: { ...type.caption, color: colors.textMuted },
  error: { color: colors.danger },
  ok: { color: colors.primary },
});
