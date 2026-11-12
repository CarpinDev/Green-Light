import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { formatCopShort } from '@/money';
import { colors, fonts, type } from '@/theme/tokens';

/** Lo que reserva la etiqueta de una barra (su alto más un respiro): la escala de las gráficas lo deja libre. */
export const BAR_LABEL_SPACE = 20;

interface BarValueProps {
  cents: number;
  /** La barra destacada (el mes actual o el próximo pago) lleva el texto en color pleno. */
  highlighted: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * El valor corto de una barra ("$1,16 M"). Muda para los lectores de pantalla: el grupo de la gráfica ya lee los
 * valores completos y esto los repetiría.
 */
export function BarValue({ cents, highlighted, style }: BarValueProps) {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={[styles.value, highlighted && styles.highlighted, style]}
    >
      {formatCopShort(cents)}
    </Text>
  );
}

const styles = StyleSheet.create({
  // Space Grotesk (la de los montos); 12 y no 13 para que "$793 mil" quepa en una de 6 columnas
  value: {
    ...type.caption,
    fontFamily: fonts.title,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: colors.textMuted,
  },
  highlighted: { color: colors.text },
});
