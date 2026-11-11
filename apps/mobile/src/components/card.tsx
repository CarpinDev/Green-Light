import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

/** Una tarjeta: superficie con borde fino. El estado (semáforo, error) va en su contenido, no en un borde de color. */
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.lg,
  },
});
