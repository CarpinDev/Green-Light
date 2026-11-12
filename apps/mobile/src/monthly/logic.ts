// La lógica pura de la pestaña "Mensual": separar vigentes y terminados, totales y fechas.

import type { MonthlyItem, MonthlyStatus } from '@/api/types';
import { formatDay, today } from '@/dates';

/** Los próximos, los vigentes y los terminados, cada grupo en el orden en que llegaron (la API ya los ordena). */
export function splitByStatus<T extends { status: MonthlyStatus }>(
  items: readonly T[],
): { upcoming: T[]; active: T[]; ended: T[] } {
  return {
    upcoming: items.filter((item) => item.status === 'upcoming'),
    active: items.filter((item) => item.status === 'active'),
    ended: items.filter((item) => item.status === 'ended'),
  };
}

/** Cuánto suma al mes lo que rige hoy (centavos). Lo próximo y lo terminado no cuentan: sumarlos contaría doble un cambio de monto. */
export function activeTotal(items: readonly { status: MonthlyStatus; amountCents: number }[]): number {
  return items.reduce((sum, item) => (item.status === 'active' ? sum + item.amountCents : sum), 0);
}

/**
 * La fecha de fin al "Terminar": hoy. Si todavía no empezó, su propio inicio, porque la API no deja un
 * fin anterior al inicio (un registro que nunca rigió empieza y termina el mismo día).
 */
export function terminationDate(startDate: string, now: Date = new Date()): string {
  const todayIso = today(now);
  return startDate > todayIso ? startDate : todayIso;
}

/** El día del mes que escribió el usuario: un entero de 1 a 31, o null. */
export function parseDayOfMonth(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const day = Number(trimmed);
  return day >= 1 && day <= 31 ? day : null;
}

/**
 * La próxima vez que se paga (o llega) algo del `dayOfMonth` DESPUÉS de `end`: la primera fecha que el fin deja
 * de contar. En un mes corto cae el último día (31 en febrero = 28). Siempre existe: devuelve YYYY-MM-DD.
 */
export function nextOccurrenceAfter(end: string, dayOfMonth: number): string {
  const [year = 0, month = 1] = end.split('-').map(Number);
  const inMonth = (y: number, m: number): string => {
    const last = new Date(y, m, 0).getDate(); // el día 0 del mes siguiente es el último de este
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dayOfMonth, last)).padStart(2, '0')}`;
  };
  const sameMonth = inMonth(year, month);
  if (sameMonth > end) return sameMonth;
  return month === 12 ? inMonth(year + 1, 1) : inMonth(year, month + 1);
}

/**
 * Lo que dice el diálogo de "Terminar": desde cuándo deja de contar y qué pago es el primero que ya no se cuenta.
 * `verb` es "resta" (un gasto) o "suma" (un ingreso).
 */
export function terminateMessage(
  item: { name: string; dayOfMonth: number },
  end: string,
  verb: 'resta' | 'suma',
): string {
  const next = nextOccurrenceAfter(end, item.dayOfMonth);
  return `${item.name} deja de contar desde el ${formatDay(end)}. El pago del ${formatDay(next)} ya no se ${verb}.`;
}

/** Lo que dice el diálogo de "Reactivar". */
export function reactivateMessage(item: { name: string }): string {
  return `${item.name} vuelve a contar cada mes desde ahora.`;
}

export interface MonthlyControls {
  /** Se muestra "Cambiar monto". */
  changeAmount: boolean;
  /** Se muestra "Terminar": solo en uno vigente sin fecha de fin. */
  terminate: boolean;
  /** Se muestra "Reactivar": tiene fecha de fin (ya pasó o es futura) y no lo reemplazó un cambio de monto. */
  reactivate: boolean;
  /** La línea de estado de arriba; null si no hay nada que decir. */
  note: string | null;
}

/**
 * Qué botones y qué texto lleva un registro. Un terminado a mano (o con un fin futuro) se reactiva; uno que
 * reemplazó un cambio de monto no: se edita el vigente.
 */
export function monthlyControls(
  item: Pick<MonthlyItem, 'status' | 'startDate' | 'endDate' | 'canReactivate' | 'replacedById'>,
): MonthlyControls {
  let note: string | null = null;
  if (item.status === 'upcoming') note = `Empieza el ${formatDay(item.startDate)}.`;
  else if (item.status === 'active' && item.endDate !== null) note = `Termina el ${formatDay(item.endDate)}.`;
  else if (item.status === 'ended' && item.endDate !== null) {
    note =
      item.replacedById !== null
        ? `Terminó el ${formatDay(item.endDate)}. Lo reemplazó un cambio de monto; edita el vigente.`
        : `Terminó el ${formatDay(item.endDate)}.`;
  }

  return {
    changeAmount: item.status !== 'ended',
    // Terminar pone la fecha de fin en hoy, y un registro cuyo fin es hoy sigue "vigente" hasta mañana: por eso se
    // mira la fecha de fin y no solo el estado (si no, Terminar seguiría saliendo justo después de usarlo)
    terminate: item.status === 'active' && item.endDate === null,
    reactivate: item.canReactivate,
    note,
  };
}
