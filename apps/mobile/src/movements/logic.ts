// La lógica pura de las pantallas de movimientos: qué texto lleva cada fila y cómo se agrupan por día.
// La fecha de hoy llega como parámetro (YYYY-MM-DD): así se prueba sin depender del reloj.

import type { Movement } from '@/api/types';
import { formatDayShort, fromIsoDate, toIsoDate, yesterday } from '@/dates';
import { formatCop } from '@/money';

const TYPE_LABEL: Record<Movement['type'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  capital_payment: 'Abono',
};

/** El nombre de la fila: la descripción si la hay, y si no, el tipo ("Gasto", "Ingreso" o "Abono"). */
export function movementLabel(m: Pick<Movement, 'description' | 'type'>): string {
  const description = m.description.trim();
  return description === '' ? TYPE_LABEL[m.type] : description;
}

/** De dónde salió o a dónde llegó: "Tarjeta Visa ••1234 · 3 cuotas", "Ahorros ••5678" o "Sin cuenta". */
export function sourceText(
  m: Pick<Movement, 'product' | 'installments' | 'direction' | 'scheduled'> & { sourceLabel?: string | null },
): string {
  const { product, installments } = m;
  // Un gasto fijo sin tarjeta no tiene producto: sale del saldo, no es que falte la cuenta
  if (product === null) return m.direction === 'out' && m.scheduled ? 'Del saldo' : 'Sin cuenta';

  const name = `${product.name} ••${product.last4}`;
  const prefix = product.kind === 'credit_card' ? 'Tarjeta ' : product.kind === 'loan' ? 'Préstamo ' : '';
  const cuotas = installments === null ? '' : ` · ${installments} ${installments === 1 ? 'cuota' : 'cuotas'}`;
  // Un abono dice además de dónde salió el dinero: "Tarjeta Nu ••4174 · desde Ahorros ••1357" o "· externo"
  const from = m.sourceLabel ? ` · ${m.sourceLabel}` : '';
  return `${prefix}${name}${cuotas}${from}`;
}

const MINUS = '\u2212';

/** El monto con el signo de su dirección: "+ $ 500.000" o "− $ 120.000". */
export function signedAmount(m: Pick<Movement, 'direction' | 'amountCents'>): string {
  return `${m.direction === 'in' ? '+' : MINUS} ${formatCop(m.amountCents)}`;
}

/** Las etiquetas pequeñas de una fila: "programado" y "deuda inicial". */
export function movementTags(m: Pick<Movement, 'scheduled' | 'isOpeningDebt'>): string[] {
  return [m.scheduled && 'programado', m.isOpeningDebt && 'deuda inicial'].filter((t): t is string => t !== false);
}

/** El título de un día: "Hoy", "Ayer", "Mañana", o la fecha corta ("12 nov"). */
export function dayTitle(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === yesterday(fromIsoDate(today))) return 'Ayer';
  if (date === tomorrow(today)) return 'Mañana';
  return formatDayShort(date);
}

/** Mañana como YYYY-MM-DD: un día del calendario después de `today`. */
function tomorrow(today: string): string {
  const d = fromIsoDate(today);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

export interface DayGroup<T> {
  date: string;
  title: string;
  items: T[];
}

/** Agrupa por día sin cambiar el orden: las filas del mismo día que van seguidas quedan en un mismo grupo. */
export function groupByDay<T extends { date: string }>(items: readonly T[], today: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, title: dayTitle(item.date, today), items: [item] });
  }
  return groups;
}
