// Qué dice una simulación, pura: de los meses "con la compra" saca el semáforo y el veredicto.

import type { Light, MonthSummary } from '@/api/types';

const SEVERITY: Record<Light, number> = { green: 0, yellow: 1, red: 2 };

/** El peor semáforo de los meses desde `now` (YYYY-MM). Sin meses, verde: no hay nada que lo ponga en duda. */
export function worstLight(months: readonly MonthSummary[], now: string): Light {
  let worst: Light = 'green';
  for (const m of months) {
    if (m.month >= now && SEVERITY[m.light] > SEVERITY[worst]) worst = m.light;
  }
  return worst;
}

/** La frase corta que acompaña al semáforo en el detalle de una opción. */
export function verdict(light: Light, exceedsLimit: boolean): { light: Light; label: string } {
  // Que no quepa en el cupo pesa más que cualquier semáforo: el banco no la aprobaría
  if (exceedsLimit) return { light: 'red', label: 'No cabe en el cupo' };
  if (light === 'green') return { light, label: 'Puedes' };
  if (light === 'yellow') return { light, label: 'Justo' };
  return { light, label: 'No alcanza' };
}
