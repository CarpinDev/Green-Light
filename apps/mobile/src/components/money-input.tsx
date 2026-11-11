import { useState } from 'react';
import { StyleSheet, type TextInputProps } from 'react-native';

import { Input } from '@/components/input';
import { formatMoneyInput, moneyText } from '@/money';
import { type } from '@/theme/tokens';

interface MoneyInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** El monto en centavos, o null si el campo está vacío. */
  value: number | null;
  onChangeCents: (cents: number | null) => void;
  /** Un saldo puede ser negativo (sobregiro); un gasto no. */
  allowNegative?: boolean;
  /** El monto como protagonista: tipografía display y sin caja (el borde y el fondo del campo normal se quitan). */
  large?: boolean;
}

/**
 * Un campo de dinero: formatea en COP mientras se escribe ("120000" -> "$ 120.000") y le entrega
 * centavos al padre. Si el padre cambia el monto (p. ej. lo borra al guardar), el campo lo sigue.
 *
 * Al reformatear, el cursor salta al final del texto. Con los dedos en un teclado numérico se escribe
 * al final casi siempre; editar un dígito del medio mueve el cursor.
 */
export function MoneyInput({
  value,
  onChangeCents,
  allowNegative = false,
  large = false,
  style,
  ...props
}: MoneyInputProps) {
  const [typed, setTyped] = useState('');
  // Se muestra lo escrito mientras siga valiendo el monto del padre; si ya no, el monto manda
  const shown = formatMoneyInput(typed, allowNegative)?.cents === value ? typed : moneyText(value);

  const handleChange = (text: string) => {
    const result = formatMoneyInput(text, allowNegative);
    if (result === null) return; // no cabe: se queda con lo que había
    setTyped(result.text);
    onChangeCents(result.cents);
  };

  return (
    <Input
      {...props}
      style={[large && styles.large, style]}
      value={shown}
      onChangeText={handleChange}
      // El teclado numérico de iOS no tiene "-": para saldos se usa el que sí lo trae
      keyboardType={allowNegative ? 'numbers-and-punctuation' : 'number-pad'}
    />
  );
}

const styles = StyleSheet.create({
  large: { ...type.display, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
});
