import { StyleSheet, Text as NativeText, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

const BY_WEIGHT: Record<string, string> = {
  '400': fonts.body,
  '500': fonts.bodyMedium,
  '600': fonts.bodySemiBold,
  '700': fonts.bodyBold,
};

/**
 * El Text de la app: color de texto y fuente del tema por defecto (el de React Native es negro, y en
 * fondo oscuro no se vería). Un `fontFamily` en el estilo manda; si no, el `fontWeight` elige la
 * variante de Inter. Con fuentes propias el grosor va en la familia, así que `fontWeight` se anula.
 */
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style);
  const fontFamily = flat?.fontFamily ?? BY_WEIGHT[String(flat?.fontWeight ?? '400')] ?? fonts.body;
  return <NativeText {...props} style={[{ color: colors.text }, style, { fontFamily, fontWeight: 'normal' }]} />;
}
