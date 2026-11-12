import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '@/theme/tokens';

/**
 * El esqueleto de un formulario modal: el contenido se desplaza y el pie (errores y botón) queda fijo
 * abajo, a la vista sin importar cuánto crezca el formulario.
 */
export function FormScreen({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(bottom, space.lg) }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, gap: space.sm, maxWidth: 640, width: '100%', alignSelf: 'center' },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
