import { ActivityIndicator, Pressable, type PressableProps, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius } from '@/theme/tokens';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  /** Muestra un spinner y deshabilita el botón: una segunda pulsación no repite la acción. */
  loading?: boolean;
}

/**
 * Un botón de la app. Acepta las props de Pressable (onPress, style…), así que sirve dentro de un
 * `<Link asChild>`.
 */
export function Button({ label, variant = 'primary', loading = false, disabled, style, ...props }: ButtonProps) {
  const inactive = disabled === true || loading;
  const textColor = variant === 'primary' ? colors.onPrimary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...props}
      disabled={inactive}
      style={(state) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        inactive && styles.inactive,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading && <ActivityIndicator color={textColor} />}
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  inactive: { opacity: 0.5 },
  label: { fontWeight: '700', fontSize: 16 },
});
