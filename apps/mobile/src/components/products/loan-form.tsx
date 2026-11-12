import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { patchJson, postJson } from '@/api/client';
import { errorText } from '@/api/errors';
import type { LoanDetail } from '@/api/types';
import { Button } from '@/components/button';
import { DateField } from '@/components/date-field';
import { FormScreen } from '@/components/form-screen';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { InsuranceFields } from '@/components/products/insurance-fields';
import { RateField } from '@/components/products/rate-field';
import { Text } from '@/components/text';
import { today } from '@/dates';
import { invalidateProducts } from '@/products/invalidate';
import { type InsuranceMode, loanBody, loanUpdateBody } from '@/products/loan';
import { isLast4, sanitizeLast4 } from '@/products/logic';
import type { RateKind } from '@/products/rates';
import { colors, space } from '@/theme/tokens';

/**
 * Registrar un préstamo que ya está en curso (sin `loan`) o editar el que existe (con `loan`). Editar solo toca el
 * nombre, la cuota y el seguro: el capital, las cuotas y la primera fecha definen el cronograma y cambiarlos
 * reescribiría los abonos; para corregirlos se elimina el préstamo y se crea de nuevo. La tasa se cambia aparte.
 */
export function LoanForm({ loan }: { loan?: LoanDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const editing = loan !== undefined;

  const [name, setName] = useState(loan?.name ?? '');
  const [bank, setBank] = useState('');
  const [last4, setLast4] = useState('');
  const [principal, setPrincipal] = useState<number | null>(null);
  const [percent, setPercent] = useState('');
  const [rateKind, setRateKind] = useState<RateKind>('ea');
  const [installments, setInstallments] = useState('');
  const [nextDate, setNextDate] = useState(today());
  const [installmentCents, setInstallmentCents] = useState<number | null>(loan?.terms.fixedPaymentCents ?? null);
  const [insuranceMode, setInsuranceMode] = useState<InsuranceMode>(
    loan?.terms.insuranceRatePct != null ? 'percent' : 'fixed',
  );
  const [insuranceCents, setInsuranceCents] = useState<number | null>(
    loan === undefined || loan.terms.insuranceCents === 0 ? null : loan.terms.insuranceCents,
  );
  const [insurancePct, setInsurancePct] = useState(loan?.terms.insuranceRatePct ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/products');
  };

  const save = useMutation({
    mutationFn: (body: object) =>
      editing ? patchJson<{ id: number }>(`/loans/${loan.id}`, body) : postJson<{ id: number }>('/loans', body),
    onSuccess: () => {
      invalidateProducts(queryClient);
      close();
    },
  });

  const percentMode = insuranceMode === 'percent';

  const submit = () => {
    if (editing) {
      const result = loanUpdateBody(loan, {
        name,
        fixedPaymentCents: installmentCents,
        insuranceMode,
        insuranceCents,
        insurancePct,
      });
      if (result.error !== undefined) return setFormError(result.error);
      setFormError(null);
      if (Object.keys(result.body).length === 0) return close();
      save.mutate(result.body);
      return;
    }

    const result = loanBody({
      name,
      bank,
      last4,
      principalCents: principal,
      percent,
      rateKind,
      installments,
      nextDate,
      installmentCents,
      insuranceMode,
      insuranceCents,
      insurancePct,
      today: today(),
    });
    if (result.error !== undefined) return setFormError(result.error);
    setFormError(null);
    save.mutate(result.body);
  };

  return (
    <FormScreen
      footer={
        <>
          {formError !== null && <Text style={styles.error}>{formError}</Text>}
          {save.isError && <Text style={styles.error}>{errorText(save.error)}</Text>}
          <Button
            label={save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear préstamo'}
            loading={save.isPending}
            onPress={submit}
          />
        </>
      }
    >
      <Label>Nombre</Label>
      <Input value={name} onChangeText={setName} placeholder="Libre inversión Nu" />

      {editing ? (
        <>
          <Label>Banco y últimos 4 dígitos</Label>
          <Text style={styles.fixed}>
            {loan.bank} ····{loan.last4}
          </Text>
          <Text style={styles.hint}>
            Tampoco se editan el capital, las cuotas ni la primera fecha: definen todo el cronograma. Si alguno está
            mal, elimina el préstamo y créalo de nuevo.
          </Text>
        </>
      ) : (
        <>
          <Label>Banco</Label>
          <Input value={bank} onChangeText={setBank} placeholder="Nu" />
          <Label>Últimos 4 dígitos</Label>
          <Input
            value={last4}
            onChangeText={(text) => setLast4(sanitizeLast4(text))}
            placeholder="1234"
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={styles.hint}>Los últimos 4 del número del préstamo, nunca el número completo.</Text>
          {last4 !== '' && !isLast4(last4) && <Text style={styles.hint}>Faltan dígitos.</Text>}

          <Label>Capital pendiente hoy</Label>
          <MoneyInput value={principal} onChangeCents={setPrincipal} placeholder="$ 0" />
          <Text style={styles.hint}>
            Si el banco muestra &quot;capital pendiente&quot;, usa ese, no la deuda total con intereses.
          </Text>

          <Label>Tasa de interés</Label>
          <RateField percent={percent} onChangePercent={setPercent} kind={rateKind} onChangeKind={setRateKind} />

          <Label>Cuotas que faltan</Label>
          <Input
            value={installments}
            onChangeText={setInstallments}
            placeholder="20"
            keyboardType="number-pad"
            maxLength={3}
          />

          <Label>Fecha de la próxima cuota</Label>
          <DateField value={nextDate} onChange={setNextDate} />
        </>
      )}

      <Label>
        {percentMode || editing ? 'Cuota sin seguro (capital + interés)' : 'Cuota que cobra el banco'} (opcional)
      </Label>
      <MoneyInput value={installmentCents} onChangeCents={setInstallmentCents} placeholder="$ 0" />
      <Text style={styles.hint}>
        {percentMode || editing
          ? 'Capital más interés, sin el seguro. Si la dejas vacía, la calculamos.'
          : 'Tal como sale en la app del banco, con seguro. Si la dejas vacía, la calculamos.'}
      </Text>

      <InsuranceFields
        mode={insuranceMode}
        onChangeMode={setInsuranceMode}
        cents={insuranceCents}
        onChangeCents={setInsuranceCents}
        pct={insurancePct}
        onChangePct={setInsurancePct}
      />
      {percentMode && !editing && (
        <Text style={styles.hint}>
          Con seguro por porcentaje la cuota va sin seguro: la del extracto trae el seguro de un saldo anterior y la
          resta no cuadraría.
        </Text>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13 },
  fixed: { color: colors.text, fontSize: 16, marginBottom: space.xs },
  error: { color: colors.danger },
});
