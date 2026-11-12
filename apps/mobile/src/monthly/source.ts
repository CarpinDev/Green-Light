// De dónde sale un gasto fijo: una cuenta, una tarjeta o ninguna ("del saldo en general"). Puro.

import type { FixedExpense } from '@/api/types';

export type ExpenseSource = { kind: 'account' | 'card'; id: number } | null;

/** El origen que ya tiene guardado un gasto fijo. */
export function sourceOf(item: Pick<FixedExpense, 'cardId' | 'accountId'>): ExpenseSource {
  if (item.cardId !== null) return { kind: 'card', id: item.cardId };
  if (item.accountId !== null) return { kind: 'account', id: item.accountId };
  return null;
}

const sameSource = (a: ExpenseSource, b: ExpenseSource) => a?.kind === b?.kind && a?.id === b?.id;

type SourceBody = { cardId?: number | null; accountId?: number | null };

/**
 * Lo que va en el cuerpo del POST (sin `original`) o del PATCH (con él) para el origen elegido.
 * - Crear: solo el campo del origen elegido, o nada.
 * - Editar: nada si no cambió; si cambió, el campo nuevo y, si antes tenía el otro tipo de origen, ese en `null`.
 *   Tarjeta a cuenta -> `{ cardId: null, accountId }`; cuenta a tarjeta -> `{ accountId: null, cardId }`;
 *   a ninguno -> los dos en `null` (solo el que tenía). La API valida el resultado final: nunca llegan las dos.
 */
export function sourceBody(source: ExpenseSource, original?: ExpenseSource): SourceBody {
  const field = (s: NonNullable<ExpenseSource>) => (s.kind === 'account' ? 'accountId' : 'cardId');

  if (original === undefined) return source === null ? {} : { [field(source)]: source.id };
  if (sameSource(source, original)) return {};

  const body: SourceBody = {};
  // Se quita el origen anterior si era de otro tipo, o si ya no hay ninguno
  if (original !== null && (source === null || original.kind !== source.kind)) body[field(original)] = null;
  if (source !== null) body[field(source)] = source.id;
  return body;
}
