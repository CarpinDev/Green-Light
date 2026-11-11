import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { colors, type } from '@/theme/tokens';

/** El rótulo de un campo de formulario. */
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...type.bodyMedium, color: colors.textMuted, marginTop: 8 },
});
