import { RateHistory } from '@greenlight/engine';
import type * as Engine from '@greenlight/engine';
import type { FixedExpense } from '../../incomes/entities/fixed-expense.entity';
import type { OneOffIncome } from '../../incomes/entities/one-off-income.entity';
import type { RecurringIncome } from '../../incomes/entities/recurring-income.entity';
import type { CapitalPayment } from '../../movements/entities/capital-payment.entity';
import type { Expense } from '../../movements/entities/expense.entity';
import type { CreditCard } from '../../products/entities/credit-card.entity';
import type { Loan } from '../../products/entities/loan.entity';
import type { ProductRate } from '../../products/entities/product-rate.entity';
import type { Settings } from '../../settings/entities/settings.entity';

// Funciones puras: entidad (lo que guarda la base) -> tipo del motor. No consultan la base ni
// usan Nest. Dos convenciones: los ids del motor son string, y un null de la base es una
// propiedad que no existe (el motor usa opcionales), no un undefined explícito.

/** Historial de tasas. Usa la E.A. y la M.V. guardadas tal cual, sin recalcular. */
export function toRateHistory(rates: readonly ProductRate[]): RateHistory {
  const history = new RateHistory();
  for (const r of rates) history.add(r.effectiveFrom, { ea: r.ea, mv: r.mv });
  return history;
}

export function toEngineCard(card: CreditCard, rates: readonly ProductRate[]): Engine.CreditCard {
  assertRatesOf(card.productId, rates);
  return {
    id: String(card.productId),
    cutDay: card.cutDay,
    dueDay: card.dueDay,
    rates: toRateHistory(rates),
    minPaymentMethod: card.minPaymentMethod,
    singleInstallmentInterestFree: card.singleInstallmentInterestFree,
    firstPeriodInterest: card.firstPeriodInterest,
    creditLimit: card.creditLimitCents,
    handlingFee: card.handlingFeeCents,
    insurance: card.insuranceCents,
  };
}

export function toEngineLoan(loan: Loan, rates: readonly ProductRate[]): Engine.Loan {
  assertRatesOf(loan.productId, rates);
  return {
    id: String(loan.productId),
    principal: loan.principalCents,
    termMonths: loan.termMonths,
    firstPaymentDate: loan.firstPaymentDate,
    rates: toRateHistory(rates),
    method: loan.method,
    ...(loan.fixedPaymentCents !== null && { fixedPayment: loan.fixedPaymentCents }),
    insurance: loan.insuranceCents,
  };
}

/** Un gasto con tarjeta. Sin cuotas no es de tarjeta: es un error del service, no del usuario. */
export function toCardPurchase(expense: Expense): Engine.CardPurchase {
  if (expense.installments === null) {
    throw new Error(`el gasto ${expense.id} no tiene cuotas: no es una compra con tarjeta`);
  }
  return {
    id: String(expense.id),
    cardId: String(expense.sourceProductId),
    date: expense.date,
    amount: expense.amountCents,
    installments: expense.installments,
    ...(expense.promoEa !== null &&
      expense.promoMv !== null && { promoRate: { ea: expense.promoEa, mv: expense.promoMv } }),
    // La deuda inicial ya venía cobrando interés: su primer corte lleva el mes completo, no es una compra nueva
    ...(expense.isOpeningDebt && { firstPeriodInterest: 'full_month' as const }),
  };
}

/**
 * Un gasto desde una cuenta: sale del disponible el mismo día. `afterBalance` ya viene resuelto (si se
 * registró después del saldo confirmado): el mapper no sabe de `asOf` ni de horas.
 */
export function toCashExpense(expense: Expense, afterBalance = false): Engine.CashExpense {
  return {
    id: String(expense.id),
    date: expense.date,
    amount: expense.amountCents,
    description: expense.description,
    ...(afterBalance && { afterBalance }),
  };
}

/** Sin `expenseId` el motor reparte el abono por mayor tasa (no viene `purchaseId`). */
export function toCardCapitalPayment(payment: CapitalPayment): Engine.CapitalPayment {
  return {
    id: String(payment.id),
    cardId: String(payment.productId),
    ...(payment.expenseId !== null && { purchaseId: String(payment.expenseId) }),
    date: payment.date,
    amount: payment.amountCents,
    mode: payment.mode,
    // El abono externo baja la deuda igual, pero no resta del disponible (lo resuelve el motor)
    ...(payment.isExternal && { external: true }),
  };
}

export function toLoanPrepayment(payment: CapitalPayment): Engine.LoanPrepayment {
  if (payment.expenseId !== null) {
    throw new Error(`el abono ${payment.id} es a un préstamo y apunta a la compra ${payment.expenseId}`);
  }
  return {
    id: String(payment.id),
    loanId: String(payment.productId),
    date: payment.date,
    amount: payment.amountCents,
    mode: payment.mode,
    ...(payment.isExternal && { external: true }),
  };
}

export function toRecurringIncome(income: RecurringIncome): Engine.RecurringIncome {
  return {
    id: String(income.id),
    name: income.name,
    amount: income.amountCents,
    day: income.dayOfMonth,
    start: income.startDate,
    ...(income.endDate !== null && { end: income.endDate }),
  };
}

/** `afterBalance`: se registró después del saldo confirmado (lo decide quien arma la proyección). */
export function toOneOffIncome(income: OneOffIncome, afterBalance = false): Engine.OneOffIncome {
  return {
    id: String(income.id),
    date: income.date,
    amount: income.amountCents,
    description: income.description,
    ...(afterBalance && { afterBalance }),
  };
}

/** Con tarjeta, el motor lo vuelve una compra a 1 cuota cada mes; sin tarjeta sale del disponible. */
export function toFixedExpense(expense: FixedExpense): Engine.FixedExpense {
  return {
    id: String(expense.id),
    name: expense.name,
    amount: expense.amountCents,
    day: expense.dayOfMonth,
    start: expense.startDate,
    ...(expense.endDate !== null && { end: expense.endDate }),
    ...(expense.cardId !== null && { cardId: String(expense.cardId) }),
  };
}

/** Solo los 4 umbrales, sin el id de la fila. */
export function toEngineSettings(settings: Settings): Engine.Settings {
  return {
    yellowBelowIncomePct: settings.yellowBelowIncomePct,
    cardUtilizationPct: settings.cardUtilizationPct,
    debtToIncomePct: settings.debtToIncomePct,
    statementTolerancePct: settings.statementTolerancePct,
  };
}

function assertRatesOf(productId: number, rates: readonly ProductRate[]): void {
  const foreign = rates.find((r) => r.productId !== productId);
  if (foreign) {
    throw new Error(`la tasa ${foreign.id} es del producto ${foreign.productId}, no del producto ${productId}`);
  }
}
