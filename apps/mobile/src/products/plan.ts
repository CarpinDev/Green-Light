// Lo que la pantalla de una tarjeta hace con el plan de pagos y con la comparación contra el extracto: pura.

import type { PlanCut, StatementCheckResponse } from '@/api/types';
import { formatPercent } from '@/products/rates';

export interface PlanBar {
  /** El corte (YYYY-MM-DD): llave de la barra. */
  cutDate: string;
  /** El mes del pago (YYYY-MM): la etiqueta de la barra. */
  month: string;
  value: number;
  /** El próximo pago: la primera barra, que se destaca. */
  highlighted: boolean;
}

/** Una barra por corte con su mínimo; la primera es el próximo pago. */
export function planBars(cuts: readonly PlanCut[]): PlanBar[] {
  return cuts.map((cut, i) => ({
    cutDate: cut.cutDate,
    month: cut.dueDate.slice(0, 7),
    value: cut.minimum.total,
    highlighted: i === 0,
  }));
}

/**
 * El alto de cada barra: proporcional al mínimo, con la más alta en `max`. Un valor mayor que 0 nunca baja de
 * `min` (para que se vea) y uno de 0 no se dibuja.
 */
export function barHeights(values: readonly number[], max: number, min: number): number[] {
  const top = Math.max(0, ...values);
  if (top === 0) return values.map(() => 0);
  return values.map((v) => (v <= 0 ? 0 : Math.max(min, Math.round((v / top) * max))));
}

/**
 * El corte que se puede comparar con un extracto: el primero del plan, si ya cerró (su extracto ya existe),
 * porque la API no valida un corte que todavía no llega. Null si el primero aún no llega.
 */
export function comparableCut(cuts: readonly PlanCut[], today: string): PlanCut | null {
  const first = cuts[0];
  return first !== undefined && first.cutDate <= today ? first : null;
}

export interface CheckVerdict {
  within: boolean;
  /** "Coincide: la diferencia es de ..." */
  headline: string;
  /** Qué hacer con el resultado. */
  advice: string;
}

/** Cómo se cuenta una comparación: dentro de la tolerancia (2 %) o no, y qué hacer. */
export function checkVerdict(check: StatementCheckResponse['check']): CheckVerdict {
  const relative = Number(check.relativeDifference);
  // Si el banco dice 0 y Green Light no, la diferencia relativa es infinita: no hay un porcentaje que mostrar
  const percent = Number.isFinite(relative) ? formatPercent(check.relativeDifference) : 'sin porcentaje';
  const direction = check.difference > 0 ? 'Green Light calcula más' : 'Green Light calcula menos';

  if (check.withinTolerance) {
    return {
      within: true,
      headline: `Coincide: la diferencia es de ${percent}, dentro de la tolerancia (2 %).`,
      advice: 'Tu deuda inicial y tu tasa están bien cargadas.',
    };
  }
  return {
    within: false,
    headline: `No coincide: la diferencia es de ${percent}, mayor a la tolerancia (2 %). ${direction}.`,
    advice: 'Si la diferencia es grande, revisa los grupos de tu deuda inicial o la tasa.',
  };
}
