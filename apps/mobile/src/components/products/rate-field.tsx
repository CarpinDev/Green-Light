import { StyleSheet } from 'react-native';

import { ChoiceButtons } from '@/components/choice-buttons';
import { Input } from '@/components/input';
import { Text } from '@/components/text';
import type { RateKind } from '@/products/rates';
import { colors, space } from '@/theme/tokens';

const KINDS: { value: RateKind; label: string }[] = [
  { value: 'ea', label: 'E.A.' },
  { value: 'mv', label: 'M.V.' },
];

interface RateFieldProps {
  percent: string;
  onChangePercent: (text: string) => void;
  kind: RateKind;
  onChangeKind: (kind: RateKind) => void;
  /** Lo que se ve con el campo vacío; por defecto un ejemplo. */
  placeholder?: string;
}

/** Una tasa como la publica el banco: el porcentaje y si es E.A. (efectiva anual) o M.V. (mensual vencida). */
export function RateField({ percent, onChangePercent, kind, onChangeKind, placeholder = '28,99' }: RateFieldProps) {
  return (
    <>
      <Input
        value={percent}
        onChangeText={onChangePercent}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        accessibilityLabel="Tasa en porcentaje"
      />
      <ChoiceButtons items={KINDS} selected={kind} onSelect={onChangeKind} />
      <Text style={styles.hint}>
        {kind === 'ea'
          ? 'E.A. es la tasa efectiva anual, la que suele publicar el banco. Escríbela como porcentaje: 28,99.'
          : 'M.V. es la tasa mensual vencida, la que aparece en tu extracto. Escríbela como porcentaje: 2,14.'}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: space.xs },
});
