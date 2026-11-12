// Los compromisos del mes y el "restante real". Puro: sale de los eventos de la proyección, con la fecha de hoy
// como parámetro. Va en su propio archivo (y no en summary.ts) porque es una regla de negocio completa con su
// propia explicación; summary.ts se queda con textos y formas de las tarjetas.
//
// La regla: una tarjeta cuenta por CORTE (el extracto que cierra el 14 de noviembre se paga con el salario de
// noviembre aunque la plata salga el 4 de diciembre); un gasto fijo o una cuota de préstamo cuentan en el mes
// de su fecha de pago. Solo cuentan los pendientes (pago después de hoy): lo anterior ya está en el saldo de hoy.
//
// Por qué la fórmula es equivalente a "tienes hoy + ingresos que faltan − compromisos":
//   cierre(M) = hoy + ingresos hasta M − todo lo que SALE hasta M          (la proyección cuenta cuándo sale)
//   restante  = cierre(M) − pagos de tarjeta con corte ≤ M que salen después de M
//             = hoy + ingresos hasta M − (lo que sale hasta M + lo que ya debes y sale después)
//             = hoy + ingresos hasta M − todos los compromisos de M        (los de tarjeta, contados por corte)
// Se parte del cierre de la proyección y no de una suma aparte: los dos números salen de los mismos eventos,
// así que no pueden contradecirse (si cambia un gasto, cambian los dos juntos).

import type { CashEvent, Light, MonthSummary } from '@/api/types';

export interface Commitment {
  kind: 'card_payment' | 'fixed_expense' | 'loan_payment';
  /** El nombre para mostrar: "Nu ····4174" o el nombre del gasto fijo. */
  label: string;
  refId?: string;
  /** Cuándo sale la plata. */
  dueDate: string;
  /** Solo en tarjetas: el corte del extracto. */
  cutDate?: string;
  /** Positivo: el mínimo o la cuota. */
  amount: number;
  /** Solo en tarjetas: lo que saldaría todo el extracto. */
  fullPayment?: number;
  /** Una tarjeta cuyo corte es después de hoy: el extracto aún no cierra y el monto puede cambiar. */
  estimated: boolean;
}

export interface MonthCommitments {
  /** Ordenados por la fecha en que sale la plata. */
  items: Commitment[];
  totalCents: number;
  /** El cierre de la proyección menos los pagos de tarjeta ya cortados que salen después de fin de mes. */
  realRemainingCents: number;
}

export interface CardName {
  id: number;
  name: string;
  last4: string;
}

type CommitmentKind = Commitment['kind'];
const KINDS: readonly string[] = ['card_payment', 'fixed_expense', 'loan_payment'] satisfies CommitmentKind[];

/** Los compromisos pendientes de `month` (YYYY-MM) y el restante real a fin de ese mes. */
export function monthCommitments(
  months: readonly MonthSummary[],
  month: string,
  today: string,
  cards: readonly CardName[] = [],
  loans: readonly LoanName[] = [],
): MonthCommitments {
  // Fechas ISO: comparar como texto. "YYYY-MM-31" es mayor que cualquier día del mes y menor que el siguiente
  const endOfMonth = `${month}-31`;
  const events = months.flatMap((m) => m.events).filter((e) => e.amount < 0 && KINDS.includes(e.kind));

  const items: Commitment[] = [];
  for (const e of events) {
    if (e.date <= today) continue; // lo que ya pasó está dentro del saldo de hoy

    if (e.kind === 'card_payment') {
      // Por corte: cuenta si el corte es de este mes o de antes (y todavía no se ha pagado: la fecha es posterior a hoy)
      if (e.cutDate === undefined || e.cutDate > endOfMonth) continue;
      items.push({
        kind: 'card_payment',
        label: cardLabel(e.refId, cards),
        ...(e.refId !== undefined && { refId: e.refId }),
        dueDate: e.date,
        cutDate: e.cutDate,
        amount: -e.amount,
        ...(e.fullPayment !== undefined && { fullPayment: e.fullPayment }),
        estimated: e.cutDate > today,
      });
    } else if (e.date.startsWith(`${month}-`)) {
      items.push({
        kind: e.kind as 'fixed_expense' | 'loan_payment',
        label: e.kind === 'loan_payment' ? loanLabel(e.refId, e.label, loans) : e.label,
        ...(e.refId !== undefined && { refId: e.refId }),
        dueDate: e.date,
        amount: -e.amount,
        estimated: false,
      });
    }
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const closing = months.find((m) => m.month === month)?.closingBalance ?? 0;
  // Lo que ya debes pero sale después de fin de mes todavía no está en el cierre: se resta. Lo que sale dentro del
  // mes ya está en el cierre (y restarlo otra vez lo contaría doble)
  const outsideClosing = items
    .filter((c) => c.kind === 'card_payment' && c.dueDate > endOfMonth)
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    items,
    totalCents: items.reduce((sum, c) => sum + c.amount, 0),
    realRemainingCents: closing - outsideClosing,
  };
}

function cardLabel(refId: string | undefined, cards: readonly CardName[]): string {
  const card = cards.find((c) => String(c.id) === refId);
  return card === undefined ? 'Tarjeta' : `${card.name} ····${card.last4}`;
}

/**
 * El semáforo del restante real (el protagonista de Inicio): rojo si es negativo; amarillo si queda menos que el
 * umbral de ajustes sobre el ingreso de referencia del mes (el mismo umbral del semáforo de los meses); si no,
 * verde. Sin el umbral (la consulta de ajustes no llegó) solo hay rojo y verde. No mira el punto más bajo del
 * mes: eso es del flujo de caja, y el semáforo de las barras de los meses (`MonthSummary.light`) no cambia.
 */
export function realRemainingLight(
  remainingCents: number,
  month: Pick<MonthSummary, 'referenceIncome'>,
  yellowBelowIncomePct: string | null,
): Light {
  if (remainingCents < 0) return 'red';
  const pct = yellowBelowIncomePct === null ? 0 : Number(yellowBelowIncomePct);
  return remainingCents < month.referenceIncome * (Number.isFinite(pct) ? pct : 0) ? 'yellow' : 'green';
}

/** Un evento de pago de tarjeta con su corte (los demás no lo traen). */
export function hasCut(event: CashEvent): event is CashEvent & { cutDate: string } {
  return event.kind === 'card_payment' && event.cutDate !== undefined;
}

export interface LoanName {
  id: number;
  name: string;
}

/** El nombre del préstamo en vez del "Cuota 3 préstamo" del motor; sin la consulta, queda el texto del motor. */
function loanLabel(refId: string | undefined, fallback: string, loans: readonly LoanName[]): string {
  return loans.find((l) => String(l.id) === refId)?.name ?? fallback;
}
