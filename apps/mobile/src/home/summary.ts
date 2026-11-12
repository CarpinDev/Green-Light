// La lógica del inicio, pura: recibe lo que responde GET /projection y devuelve lo que las tarjetas
// muestran. Sin React y sin la fecha de hoy escondida: la fecha llega como parámetro, y por eso se prueba.

import type { Alert, CashEvent, CashEventKind, Light, MonthSummary, Product } from '@/api/types';
import { formatMonthName } from '@/dates';

/** Los meses desde `now` (YYYY-MM): el primer mes proyectado puede ya haber pasado. */
export function visibleMonths(months: readonly MonthSummary[], now: string): MonthSummary[] {
  return months.filter((m) => m.month >= now);
}

/** El primer mes visible: el mes actual (o el siguiente, si la proyección no trae el actual). */
export function firstVisibleMonth(months: readonly MonthSummary[], now: string): MonthSummary | undefined {
  return visibleMonths(months, now)[0];
}

/**
 * Qué parte del ingreso del mes queda al cierre, en % entero y entre 0 y 100: el cierre puede pasar del
 * ingreso (había colchón de antes) o ser negativo, y una barra de progreso no se sale de su caja.
 * Sin ingreso de referencia no hay proporción: null.
 */
export function incomeShare(month: Pick<MonthSummary, 'closingBalance' | 'referenceIncome'>): number | null {
  if (month.referenceIncome <= 0) return null;
  const pct = Math.round((month.closingBalance / month.referenceIncome) * 100);
  return Math.min(100, Math.max(0, pct));
}

const byDate = (a: CashEvent, b: CashEvent) => a.date.localeCompare(b.date);

/** Las salidas (amount < 0) de hoy en adelante, de la fecha más cercana a la más lejana. Máximo `limit`. */
export function upcomingPayments(events: readonly CashEvent[], today: string, limit = 3): CashEvent[] {
  return events
    .filter((e) => e.amount < 0 && e.date >= today)
    .sort(byDate)
    .slice(0, limit);
}

/** Los ingresos (amount > 0) de hoy en adelante, de la fecha más cercana a la más lejana. Máximo `limit`. */
export function upcomingIncomes(events: readonly CashEvent[], today: string, limit = 1): CashEvent[] {
  return events
    .filter((e) => e.amount > 0 && e.date >= today)
    .sort(byDate)
    .slice(0, limit);
}

/** Lo que viene: las próximas 3 salidas y el próximo ingreso, todo junto y por fecha. */
export function upcomingMovements(events: readonly CashEvent[], today: string): CashEvent[] {
  return [...upcomingPayments(events, today), ...upcomingIncomes(events, today)].sort(byDate);
}

/** El nombre con que se muestra cada tipo de movimiento. */
export const KIND_LABEL: Record<CashEventKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  fixed_expense: 'Gasto fijo',
  loan_payment: 'Cuota de préstamo',
  card_payment: 'Pago de tarjeta',
  capital_payment: 'Abono a capital',
};

export interface ChartBar {
  month: string;
  /** El cierre del mes, con signo. */
  value: number;
  light: Light;
  /** Del 0 al 1: |cierre| entre el mayor |cierre| de todos los meses. El signo va en `value`. */
  heightRatio: number;
}

/** Una barra por mes. La escala es una sola para todas, y un cierre negativo mide igual que uno positivo. */
export function chartBars(months: readonly MonthSummary[]): ChartBar[] {
  const largest = Math.max(0, ...months.map((m) => Math.abs(m.closingBalance)));
  return months.map((m) => ({
    month: m.month,
    value: m.closingBalance,
    light: m.light,
    heightRatio: largest === 0 ? 0 : Math.abs(m.closingBalance) / largest,
  }));
}

export interface BarShape {
  /** Alto en píxeles. */
  height: number;
  /** Cuelga de la línea base hacia abajo (cierre negativo). */
  below: boolean;
}

/**
 * Pasa las proporciones a píxeles. `maxHeight` es lo que mide la barra más grande; ninguna baja de
 * `minHeight`, para que un cierre diminuto (o cero) siga viéndose. `up` y `down` son lo que la gráfica
 * necesita por encima y por debajo de la línea base: sin meses negativos, `down` es 0 y no se reserva nada.
 */
export function barGeometry(
  bars: readonly ChartBar[],
  maxHeight: number,
  minHeight: number,
): { up: number; down: number; shapes: BarShape[] } {
  const shapes = bars.map((b) => ({
    height: Math.max(minHeight, Math.round(b.heightRatio * maxHeight)),
    below: b.value < 0,
  }));
  const tallest = (below: boolean) => Math.max(0, ...shapes.filter((s) => s.below === below).map((s) => s.height));
  return { up: tallest(false), down: tallest(true), shapes };
}

const pct = (ratio: string) => Math.round(Number(ratio) * 100);

/** El aviso de una alerta de la proyección, con el nombre de la tarjeta cuando se conoce. */
export function alertMessage(alert: Alert, products: readonly Product[]): string {
  if (alert.kind === 'card_utilization') {
    const card = products.find((p) => String(p.id) === alert.refId);
    const name = card ? `${card.name} ····${card.last4}` : 'Una de tus tarjetas';
    return `${name} usa el ${pct(alert.value)} % del cupo. Pasar del ${pct(alert.threshold)} % afecta tu historial.`;
  }
  return `En ${formatMonthName(alert.refId)} tus pagos de deuda son el ${pct(alert.value)} % de tu ingreso; lo recomendable es no pasar del ${pct(alert.threshold)} %.`;
}

/**
 * Todo lo que viene desde mañana en el mes actual y el siguiente, por fecha (de la proyección). Lo de hoy no
 * entra: ya pasó para "Movimientos recientes" (que llega hasta hoy incluido), y así no sale en las dos listas.
 * Un gasto con tarjeta no aparece el día de la compra: aparece como "Pago de tarjeta" el día del pago del extracto.
 */
export function upcomingEvents(months: readonly MonthSummary[], now: string, today: string): CashEvent[] {
  return visibleMonths(months, now)
    .slice(0, 2)
    .flatMap((m) => m.events)
    .filter((e) => e.date > today)
    .sort(byDate);
}
