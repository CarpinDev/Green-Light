import { StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { type } from '@/theme/tokens';

/** El rótulo de un campo de formulario. */
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...type.bodyMedium, marginTop: 8 },
});
