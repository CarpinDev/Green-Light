// Confirmar un pago: qué se puede confirmar, el cuerpo que se manda y los avisos. Puro (la fecha de hoy llega por
// parámetro), así se prueba sin la pantalla.

import type { CashEvent, ConfirmedPaymentInfo, Movement } from '@/api/types';
import { eventTitle } from '@/home/summary';
import { formatCop } from '@/money';
import { formatDayShort } from '@/dates';
import { type PaymentMode, type PaymentSource, sourceBody } from '@/products/payment';

/** Qué se confirma: el pago de una tarjeta o un préstamo, la llegada de un ingreso o el pago de un gasto fijo. */
export type ConfirmKind = 'card' | 'loan' | 'income' | 'fixed';

/** Todo lo que el modal necesita saber del pago esperado. */
export interface ConfirmTarget {
  kind: ConfirmKind;
  /** La tarjeta o el préstamo; o el ingreso recurrente o el gasto fijo. */
  id: number;
  /** El corte, la fecha de la cuota o la fecha esperada: la clave del pago, no cambia aunque se pague otro día. */
  scheduledDate: string;
  /** Cómo se llama, para el título del modal. */
  name: string;
  /** Lo esperado (el mínimo, la cuota o el monto programado), en positivo: viene prellenado. */
  expectedCents: number;
  /** Solo tarjetas: lo que saldaría todo el extracto. */
  fullPaymentCents?: number;
}

export const SHORTFALL_WARNING =
  'Pagaste menos del mínimo: el banco te cobrará intereses de mora que Green Light todavía no calcula.';

/** El botón de cada tipo: el salario "llega", lo demás se "paga". */
export function confirmLabel(kind: ConfirmKind): string {
  return kind === 'income' ? 'Llegó' : 'Marcar pagado';
}

/** Un pago de tarjeta o de préstamo (lo que se paga a una deuda, con excedente y faltante). */
export function isDebt(kind: ConfirmKind): kind is 'card' | 'loan' {
  return kind === 'card' || kind === 'loan';
}

const KIND_OF_EVENT: Partial<Record<CashEvent['kind'], ConfirmKind>> = {
  card_payment: 'card',
  loan_payment: 'loan',
  income: 'income',
  fixed_expense: 'fixed',
};

/**
 * Qué confirmar de un evento de la proyección, o null si no se puede (ya está confirmado, no es programado como un
 * ingreso puntual, o es el faltante de un corte, que no tiene fecha programada). Usa `scheduledDate`, `refId` y
 * `kind` del evento, nunca el `label`.
 */
export function targetFromEvent(event: CashEvent): ConfirmTarget | null {
  const kind = KIND_OF_EVENT[event.kind];
  if (kind === undefined || event.confirmed === true || event.scheduledDate === undefined) return null;
  const id = Number(event.refId);
  if (event.refId === undefined || !Number.isInteger(id)) return null;

  return {
    kind,
    id,
    scheduledDate: event.scheduledDate,
    name: eventTitle(event),
    expectedCents: Math.abs(event.amount),
    ...(event.fullPayment !== undefined && { fullPaymentCents: event.fullPayment }),
  };
}

/** Qué confirmar de un movimiento programado (salario o gasto fijo con cuenta) del feed, o null si no se puede. */
export function targetFromMovement(m: Movement): ConfirmTarget | null {
  if (!m.scheduled || m.scheduledDate === null || m.refId === null || m.refKind === null) return null;
  return {
    kind: m.refKind === 'recurring_income' ? 'income' : 'fixed',
    id: m.refId,
    scheduledDate: m.scheduledDate,
    name: m.description,
    expectedCents: m.amountCents,
  };
}

/** De un pago ya confirmado se deshace con su id; null si el movimiento no es una confirmación. */
export function undoOfMovement(m: Pick<Movement, 'debtPaymentId' | 'confirmationId'>): { path: string } | null {
  if (m.debtPaymentId !== null) return { path: `/debt-payments/${m.debtPaymentId}` };
  if (m.confirmationId !== null) return { path: `/recurring-confirmations/${m.confirmationId}` };
  return null;
}

/** Los parámetros de ruta del modal (todo texto: así viajan por la URL). */
export function confirmParams(t: ConfirmTarget): Record<string, string> {
  return {
    kind: t.kind,
    id: String(t.id),
    scheduledDate: t.scheduledDate,
    name: t.name,
    expected: String(t.expectedCents),
    ...(t.fullPaymentCents !== undefined && { full: String(t.fullPaymentCents) }),
  };
}

/** Lo contrario de `confirmParams`: null si falta algo o está mal (una URL a mano, un enlace viejo). */
export function parseConfirmTarget(params: Record<string, string | string[] | undefined>): ConfirmTarget | null {
  const text = (key: string) => (typeof params[key] === 'string' ? params[key] : undefined);
  const kind = text('kind');
  const id = Number(text('id'));
  const expected = Number(text('expected'));
  const scheduledDate = text('scheduledDate');
  if (kind !== 'card' && kind !== 'loan' && kind !== 'income' && kind !== 'fixed') return null;
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(expected) || expected < 0) return null;
  if (scheduledDate === undefined) return null;

  const full = text('full');
  return {
    kind,
    id,
    scheduledDate,
    name: text('name') ?? '',
    expectedCents: expected,
    ...(full !== undefined && Number.isInteger(Number(full)) && { fullPaymentCents: Number(full) }),
  };
}

/** Lo que pasó del mínimo (excedente: abono a capital) y lo que faltó (se proyecta en el siguiente pago). */
export function splitPayment(paidCents: number, expectedCents: number): { excess: number; shortfall: number } {
  return { excess: Math.max(0, paidCents - expectedCents), shortfall: Math.max(0, expectedCents - paidCents) };
}

/** "El excedente ($ 100.000) se registra como abono a capital." */
export function excessNote(excess: number): string {
  return `El excedente (${formatCop(excess)}) se registra como abono a capital.`;
}

/** El primer error del formulario, o null si se puede enviar. */
export function validateConfirmation(p: {
  target: ConfirmTarget;
  amountCents: number | null;
  source: PaymentSource;
  date: string;
  today: string;
}): string | null {
  const { target, amountCents, source, date, today } = p;
  if (amountCents === null || amountCents <= 0) return 'Escribe cuánto fue.';
  if (isDebt(target.kind) && source === null) return 'Elige de dónde salió el dinero (una cuenta o "Externo").';
  if (date > today) return 'La fecha no puede ser futura: confírmalo cuando pase.';
  // Una tarjeta no se paga antes de que haya extracto
  if (target.kind === 'card' && date < target.scheduledDate) {
    return `No puedes pagar antes del corte (${formatDayShort(target.scheduledDate)}).`;
  }
  return null;
}

/**
 * El cuerpo de POST /debt-payments, o null si el formulario no es válido. El `mode` solo viaja si hay excedente: sin
 * abono no hay nada que reducir.
 */
export function debtPaymentBody(p: {
  target: ConfirmTarget;
  paidDate: string;
  amountCents: number | null;
  source: PaymentSource;
  mode: PaymentMode;
}): object | null {
  const from = sourceBody(p.source);
  if (from === null || p.amountCents === null || p.amountCents <= 0) return null;
  const { excess } = splitPayment(p.amountCents, p.target.expectedCents);
  return {
    productId: p.target.id,
    scheduledDate: p.target.scheduledDate,
    paidDate: p.paidDate,
    amountCents: p.amountCents,
    ...from,
    ...(excess > 0 && { mode: p.mode }),
  };
}

/** El cuerpo de POST /recurring-confirmations (la cuenta es opcional), o null si falta el monto. */
export function recurringBody(p: {
  target: ConfirmTarget;
  actualDate: string;
  amountCents: number | null;
  accountId: number | null;
}): object | null {
  if (p.amountCents === null || p.amountCents <= 0) return null;
  return {
    ...(p.target.kind === 'income' ? { recurringIncomeId: p.target.id } : { fixedExpenseId: p.target.id }),
    scheduledDate: p.target.scheduledDate,
    actualDate: p.actualDate,
    amountCents: p.amountCents,
    ...(p.accountId !== null && { accountId: p.accountId }),
  };
}

/** "Pagado el 25 nov · $ 150.000" (o "Pagado el 25 nov · $ 150.000 · $ 50.000 de abono a capital"). */
export function paidSummary(c: ConfirmedPaymentInfo): string {
  const excess = c.excessCents > 0 ? ` · ${formatCop(c.excessCents)} de abono a capital` : '';
  return `Pagado el ${formatDayShort(c.paidDate)} · ${formatCop(c.amountCents)}${excess}`;
}
