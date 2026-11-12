import { type Cents, type IsoDate, fixedExpensesAsPurchases, planCard, unbilledBalance } from '@greenlight/engine';
import { toCardCapitalPayment, toCardPurchase, toEngineCard, toFixedExpense } from '../projection/mappers';
import type { CardPlanFacts } from './build-card-plan';

/**
 * Lo que se puede abonar a la deuda de una tarjeta en `date`: el capital que todavía no está facturado. Con
 * `expenseId`, solo el de esa compra. Usa las mismas piezas del plan (`planCard` y `unbilledBalance`): los
 * abonos que ya hay se aplican primero, así que el límite baja con cada uno. Pura, sin base de datos.
 */
export function abonableDebt(facts: CardPlanFacts, date: IsoDate, expenseId?: number): Cents {
  const { card: row } = facts;
  const card = toEngineCard(
    row,
    facts.rates.filter((r) => r.productId === row.productId),
  );

  // Solo lo que ya existía en `date`; los gastos fijos con esta tarjeta también se facturan en ella
  const own = facts.expenses.filter((e) => e.sourceProductId === row.productId).map(toCardPurchase);
  const purchases = [...own, ...fixedExpensesAsPurchases(card, facts.fixedExpenses.map(toFixedExpense), date, date)];
  const payments = facts.capitalPayments
    .filter((p) => p.productId === row.productId && p.date <= date)
    .map(toCardCapitalPayment);

  const { rows } = planCard(card, purchases, payments);
  const ids = expenseId === undefined ? purchases.filter((p) => p.date <= date).map((p) => p.id) : [String(expenseId)];

  return ids.reduce(
    (sum, id) =>
      sum +
      unbilledBalance(
        rows.filter((r) => r.purchaseId === id),
        date,
      ),
    0,
  );
}
