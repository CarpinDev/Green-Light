import { StyleSheet } from 'react-native';

import { ChoiceButtons } from '@/components/choice-buttons';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { Text } from '@/components/text';
import type { InsuranceMode } from '@/products/loan';
import { colors } from '@/theme/tokens';

const MODES = [
  { value: 'fixed', label: 'Monto fijo' },
  { value: 'percent', label: '% del saldo' },
] as const;

interface InsuranceFieldsProps {
  mode: InsuranceMode;
  onChangeMode: (mode: InsuranceMode) => void;
  cents: number | null;
  onChangeCents: (cents: number | null) => void;
  pct: string;
  onChangePct: (text: string) => void;
}

/** El seguro del préstamo (opcional): un monto fijo cada mes o un porcentaje mensual del saldo, que baja con el saldo. */
export function InsuranceFields({ mode, onChangeMode, cents, onChangeCents, pct, onChangePct }: InsuranceFieldsProps) {
  return (
    <>
      <Label>Seguro (opcional)</Label>
      <ChoiceButtons items={MODES} selected={mode} onSelect={onChangeMode} />
      {mode === 'fixed' ? (
        <>
          <MoneyInput value={cents} onChangeCents={onChangeCents} placeholder="$ 0" />
          <Text style={styles.hint}>Lo que cobra de seguro cada mes, igual todos los meses.</Text>
        </>
      ) : (
        <>
          <Input value={pct} onChangeText={onChangePct} placeholder="0,2344" keyboardType="decimal-pad" />
          <Text style={styles.hint}>
            Porcentaje mensual del saldo (por ejemplo 0,2344). El seguro baja cada mes porque el saldo baja.
          </Text>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13 },
});
