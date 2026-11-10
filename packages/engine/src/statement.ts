import Decimal from 'decimal.js';
import { type IsoDate, cutDateFor, dueDateFor } from './calendar';
import type { Cents } from './money';
import { sumBy } from './collections';
import type { CardPurchase, CreditCard, PurchaseRow } from './cards';

export interface PaymentBreakdown {
  capital: Cents;
  interest: Cents;
  fees: Cents;
  total: Cents;
}

export interface Statement {
  cardId: string;
  cutDate: IsoDate;
  dueDate: IsoDate;
  /** Cuotas facturadas en este corte. */
  lines: PurchaseRow[];
  /** Lo que hay que pagar para quedar al día: las cuotas del corte. */
  minimum: PaymentBreakdown;
  /** Lo que hay que pagar para saldar las compras facturadas en este corte. */
  fullPayment: PaymentBreakdown;
}

/** Extracto de la tarjeta en `cutDate`. `rows` puede traer cuotas de varias tarjetas y cortes. */
export function statement(card: CreditCard, rows: readonly PurchaseRow[], cutDate: IsoDate): Statement {
  if (cutDateFor(cutDate, card.cutDay) !== cutDate) {
    throw new RangeError(`${cutDate} no es una fecha de corte de la tarjeta ${card.id} (corte día ${card.cutDay})`);
  }

  const lines = rows.filter((r) => r.cardId === card.id && r.cutDate === cutDate);
  const interest = sumBy(lines, (l) => l.interest);
  const fees = card.handlingFee + card.insurance;

  return {
    cardId: card.id,
    cutDate,
    dueDate: dueDateFor(cutDate, card.dueDay),
    lines,
    minimum: breakdown(sumBy(lines, (l) => l.capital), interest, fees),
    // El saldo al inicio de la cuota ya incluye su capital y el de las cuotas futuras
    fullPayment: breakdown(sumBy(lines, (l) => l.openingBalance), interest, fees),
  };
}

/**
 * Capital pendiente en `date` de las compras hechas hasta ese día.
 * Cada cuota libera su capital en su fecha límite de pago (se asume pagada a tiempo).
 */
export function usedCredit(
  purchases: readonly CardPurchase[],
  rows: readonly PurchaseRow[],
  date: IsoDate,
): Cents {
  const made = purchases.filter((p) => p.date <= date);
  const ids = new Set(made.map((p) => p.id));
  const own = rows.filter((r) => ids.has(r.purchaseId));
  // La cuota libera su capital al vencer; el abono, el día que se hace
  const released =
    sumBy(own.filter((r) => r.dueDate <= date), (r) => r.capital) +
    sumBy(own.filter((r) => (r.prepaymentDate ?? r.dueDate) <= date), (r) => r.prepayment);
  return sumBy(made, (p) => p.amount) - released;
}

/** Fracción del cupo usada en `date` (0.42 = 42 %). Solo cuenta compras de esta tarjeta. */
export function utilization(
  card: CreditCard,
  purchases: readonly CardPurchase[],
  rows: readonly PurchaseRow[],
  date: IsoDate,
): Decimal {
  if (!Number.isSafeInteger(card.creditLimit) || card.creditLimit <= 0) {
    throw new RangeError(`la tarjeta ${card.id} no tiene un cupo válido: ${card.creditLimit}`);
  }
  const own = purchases.filter((p) => p.cardId === card.id);
  return new Decimal(usedCredit(own, rows, date)).div(card.creditLimit);
}

function breakdown(capital: Cents, interest: Cents, fees: Cents): PaymentBreakdown {
  return { capital, interest, fees, total: capital + interest + fees };
}
