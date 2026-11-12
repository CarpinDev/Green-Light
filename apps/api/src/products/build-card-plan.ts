import {
  cutDateFor,
  dueDateFor,
  fixedExpensesAsPurchases,
  nthCutAfter,
  planCard,
  shiftMonths,
  statement,
} from '@greenlight/engine';
import type * as Engine from '@greenlight/engine';
import type { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import type { CapitalPayment } from '../movements/entities/capital-payment.entity';
import type { Expense } from '../movements/entities/expense.entity';
import { toCardCapitalPayment, toCardPurchase, toEngineCard, toFixedExpense } from '../projection/mappers';
import type { CreditCard } from './entities/credit-card.entity';
import type { ProductRate } from './entities/product-rate.entity';

/** La tarjeta y las filas que necesita para planear sus próximos pagos (las mismas de las alertas y la validación). */
export interface CardPlanFacts {
  card: CreditCard;
  rates: readonly ProductRate[];
  /** Los gastos de esta tarjeta; los de otros productos se ignoran. */
  expenses: readonly Expense[];
  capitalPayments: readonly CapitalPayment[];
  /** Todos los gastos fijos: los que se pagan con esta tarjeta se facturan en ella. */
  fixedExpenses: readonly FixedExpense[];
}

export interface CardPlanCut {
  cutDate: Engine.IsoDate;
  dueDate: Engine.IsoDate;
  /** Lo que hay que pagar para quedar al día en este corte. */
  minimum: Engine.PaymentBreakdown;
  /** Lo que hay que pagar para saldar lo facturado en este corte. */
  fullPayment: Engine.PaymentBreakdown;
  /** El capital que todavía falta por facturar después de este corte (lo que se debe, sin contar este pago). */
  remainingDebtCents: Engine.Cents;
}

export interface CardPlan {
  cardId: number;
  cuts: CardPlanCut[];
}

/**
 * Los próximos `count` pagos de la tarjeta: los cortes cuyo pago todavía no vence (un corte ya cerrado cuyo pago
 * es en unos días cuenta: es el extracto que el usuario ya recibió). Pura, sin base de datos, y sin cálculos
 * propios: arma el plan de compras con `planCard` y cada extracto con `statement`, las mismas piezas de la
 * proyección y de la validación del extracto, así que sus cifras coinciden.
 */
export function buildCardPlan(facts: CardPlanFacts, count: number, today: Engine.IsoDate): CardPlan {
  const { card: row } = facts;
  const card = toEngineCard(
    row,
    facts.rates.filter((r) => r.productId === row.productId),
  );

  // Se arranca 2 meses atrás: un cargo de hace 2 meses puede vencer hoy (se factura en un corte y se paga en el siguiente)
  const cutDates: Engine.IsoDate[] = [];
  for (
    let cut = cutDateFor(shiftMonths(today, -2, 1), card.cutDay);
    cutDates.length < count;
    cut = nthCutAfter(cut, card.cutDay, 1)
  ) {
    if (dueDateFor(cut, card.dueDay) >= today) cutDates.push(cut);
  }
  const last = cutDates[cutDates.length - 1] ?? today;

  const own = facts.expenses.filter((e) => e.sourceProductId === row.productId).map(toCardPurchase);
  const payments = facts.capitalPayments.filter((p) => p.productId === row.productId).map(toCardCapitalPayment);
  const fixed = fixedExpensesAsPurchases(card, facts.fixedExpenses.map(toFixedExpense), today, last);
  const { rows } = planCard(card, [...own, ...fixed], payments);

  return {
    cardId: row.productId,
    cuts: cutDates.map((cutDate) => {
      const extract = statement(card, rows, cutDate);
      return {
        cutDate,
        dueDate: extract.dueDate,
        minimum: extract.minimum,
        fullPayment: extract.fullPayment,
        remainingDebtCents: rows.filter((r) => r.cutDate > cutDate).reduce((sum, r) => sum + r.capital, 0),
      };
    }),
  };
}
