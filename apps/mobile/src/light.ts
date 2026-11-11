import type { Light } from '@/api/types';

/** El color y el nombre de cada semáforo: los comparten el inicio y el simulador. */
export const LIGHT_COLOR: Record<Light, string> = { green: '#2e9e5b', yellow: '#e0a800', red: '#d64545' };
export const LIGHT_LABEL: Record<Light, string> = { green: 'Verde', yellow: 'Amarillo', red: 'Rojo' };
