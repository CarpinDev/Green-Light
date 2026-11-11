import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';

/** La barra de pestañas flota: alto fijo y separada 16px de los bordes de la pantalla. */
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_MARGIN = space.lg;

/**
 * El relleno inferior de una pantalla que se desplaza dentro de las pestañas: la barra flota encima
 * del contenido (no le quita espacio), y sin esto lo último de la lista quedaría tapado.
 */
export function useTabBarClearance(): number {
  const { bottom } = useSafeAreaInsets();
  return bottom + TAB_BAR_HEIGHT + TAB_BAR_MARGIN * 2;
}
