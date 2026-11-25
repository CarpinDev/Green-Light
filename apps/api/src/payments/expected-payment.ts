import {
  type Cents,
  type IsoDate,
  cutDateFor,
  fixedExpensesAsPurchases,
  loanSchedule,
  planCard,
  statement,
} from '@greenlight/engine';
import type { CapitalPayment } from '../movements/entities/capital-payment.entity';
import type { CardPlanFacts } from '../products/build-card-plan';
import type { Loan } from '../products/entities/loan.entity';
import type { ProductRate } from '../products/entities/product-rate.entity';
import {
  toCardCapitalPayment,
  toCardPurchase,
  toEngineCard,
  toEngineLoan,
  toFixedExpense,
  toLoanPrepayment,
} from '../projection/mappers';

/** Lo que se esperaba pagar en un corte o en una cuota. */
export interface ExpectedPayment {
  /** El pago mínimo (en un préstamo, la cuota con seguro). */
  minimumCents: Cents;
  /** Lo que saldaría todo el extracto (en un préstamo, igual a la cuota). */
  fullPaymentCents: Cents;
}

/**
 * El pago esperado de una tarjeta en su corte, o null si esa fecha no es un corte de la tarjeta o no tiene nada por
 * pagar. Usa las mismas piezas que la proyección (`planCard` y `statement`), así que las cifras coinciden.
 */
export function expectedCardPayment(facts: CardPlanFacts, cutDate: IsoDate): ExpectedPayment | null {
  const { card: row } = facts;
  const card = toEngineCard(
    row,
    facts.rates.filter((r) => r.productId === row.productId),
  );
  if (cutDateFor(cutDate, card.cutDay) !== cutDate) return null;

  const own = facts.expenses.filter((e) => e.sourceProductId === row.productId).map(toCardPurchase);
  const fixed = facts.fixedExpenses.map((f) => toFixedExpense(f));
  const charges = fixedExpensesAsPurchases(card, fixed, cutDate, cutDate);
  const payments = facts.capitalPayments.filter((p) => p.productId === row.productId).map(toCardCapitalPayment);
  const { rows } = planCard(card, [...own, ...charges], payments);

  const { minimum, fullPayment } = statement(card, rows, cutDate);
  return minimum.total > 0 ? { minimumCents: minimum.total, fullPaymentCents: fullPayment.total } : null;
}

/** La cuota (con seguro) de un préstamo en su fecha de pago, o null si no hay una cuota ese día. */
export function expectedLoanPayment(
  loan: Loan,
  rates: readonly ProductRate[],
  payments: readonly CapitalPayment[],
  dueDate: IsoDate,
): ExpectedPayment | null {
  const rows = loanSchedule(toEngineLoan(loan, rates), payments.map(toLoanPrepayment));
  const row = rows.find((r) => r.dueDate === dueDate);
  return row !== undefined && row.total > 0 ? { minimumCents: row.total, fullPaymentCents: row.total } : null;
}

/**
 * Cómo se reparte lo pagado: hasta el mínimo es el pago; lo que pase es un abono a capital (excedente); lo que
 * falte se proyecta aparte en la siguiente fecha límite. Pura.
 */
export function splitPayment(paidCents: Cents, minimumCents: Cents): { excessCents: Cents; shortfallCents: Cents } {
  return {
    excessCents: Math.max(0, paidCents - minimumCents),
    shortfallCents: Math.max(0, minimumCents - paidCents),
  };
}
