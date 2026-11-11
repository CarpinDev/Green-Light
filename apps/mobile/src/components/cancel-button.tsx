import { useRouter } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import { Text } from '@/components/text';
import { colors } from '@/theme/tokens';

/** "Cancelar" en el encabezado de un modal: lo cierra, o vuelve al inicio si el modal se abrió por URL directa. */
export function CancelButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      hitSlop={8}
      // iOS ya separa el botón del borde del encabezado; en web hay que hacerlo a mano
      style={Platform.OS === 'web' && { paddingHorizontal: 16 }}
    >
      <Text style={{ color: colors.primary, fontWeight: '500' }}>Cancelar</Text>
    </Pressable>
  );
}
