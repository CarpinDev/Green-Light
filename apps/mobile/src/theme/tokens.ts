// Los tokens del tema. La app es solo modo oscuro: no hay hook, se importan las constantes.
// Ningún color, fuente ni medida de marca va suelto en una pantalla: sale de aquí.

import type { Light } from '@/api/types';

export const colors = {
  bg: '#0E0D12',
  surface: '#18161F',
  surfaceAlt: '#221F2B',
  border: '#2C2836',
  text: '#F4F2F8',
  textMuted: '#A49FB3',
  primary: '#B9A4FF',
  /** El texto sobre `primary`. */
  onPrimary: '#1A1426',
  primarySoft: '#2A2340',
} as const;

/** El semáforo en pastel: `fg` es el texto que va encima de `bg` (oscuro, nunca blanco). */
export const light: Record<Light, { bg: string; fg: string; label: string }> = {
  green: { bg: '#8FE3B0', fg: '#0F2A1B', label: 'Holgado' },
  yellow: { bg: '#F6D88A', fg: '#2E2408', label: 'Justo' },
  red: { bg: '#F4A3A8', fg: '#3A1013', label: 'Negativo' },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 } as const;

/** Los nombres con los que se registran las fuentes en `useFonts` (ver `_layout.tsx`). */
export const fonts = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  title: 'SpaceGrotesk_600SemiBold',
  display: 'SpaceGrotesk_700Bold',
} as const;

/** Estilos de texto. El grosor ya va en la familia: no se combina con `fontWeight`. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 40 },
  title: { fontFamily: fonts.title, fontSize: 22 },
  /** El título pequeño (17): nombre de una tarjeta, de una sección. */
  subtitle: { fontFamily: fonts.title, fontSize: 17 },
  body: { fontFamily: fonts.body, fontSize: 15 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  caption: { fontFamily: fonts.body, fontSize: 13 },
  captionSmall: { fontFamily: fonts.body, fontSize: 12 },
} as const;
