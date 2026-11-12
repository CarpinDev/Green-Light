// La lógica pura de la pestaña "Mensual": separar vigentes y terminados, totales y fechas.

import { today } from '@/dates';

/** Los vigentes y los terminados, cada grupo en el orden en que llegaron (la API ya los ordena). */
export function splitByActive<T extends { active: boolean }>(items: readonly T[]): { active: T[]; ended: T[] } {
  return {
    active: items.filter((item) => item.active),
    ended: items.filter((item) => !item.active),
  };
}

/** Cuánto suma al mes lo que sigue vigente (centavos). Lo terminado no cuenta. */
export function activeTotal(items: readonly { active: boolean; amountCents: number }[]): number {
  return items.reduce((sum, item) => (item.active ? sum + item.amountCents : sum), 0);
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
