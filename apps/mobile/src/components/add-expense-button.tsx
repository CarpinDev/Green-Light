import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

/**
 * El "+" del centro de la barra. No es una pestaña: no tiene pantalla propia, abre el formulario de
 * gasto como modal. Se usa como `tabBarButton`, así que ignora las props de pestaña que le pasa la barra.
 */
export function AddExpenseButton() {
  const router = useRouter();
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar gasto"
        onPress={() => router.push('/expenses/new')}
        style={styles.button}
      >
        <Feather name="plus" size={28} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
