import { StyleSheet, Text } from 'react-native';

/** El rótulo de un campo de formulario. */
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
});
