import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  cardEvents,
  cardUtilizationAlert,
  daysBetween,
  debtToIncomeAlert,
  endOfMonth,
  fixedExpensesAsPurchases,
  loanEvents,
  planCard,
  project,
  shiftMonths,
} from '@greenlight/engine';
import type * as Engine from '@greenlight/engine';
import type { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import type { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import type { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import type { CapitalPayment } from '../movements/entities/capital-payment.entity';
import type { Expense } from '../movements/entities/expense.entity';
import type { AccountBalance } from '../products/entities/account-balance.entity';
import type { CreditCard } from '../products/entities/credit-card.entity';
import type { Loan } from '../products/entities/loan.entity';
import type { ProductRate } from '../products/entities/product-rate.entity';
import type { Settings } from '../settings/entities/settings.entity';
import {
  toCardCapitalPayment,
  toCardPurchase,
  toCashExpense,
  toEngineCard,
  toEngineSettings,
  toEngineLoan,
  toFixedExpense,
  toLoanPrepayment,
  toOneOffIncome,
  toRecurringIncome,
} from './mappers';

/** Las filas que el service ya leyó de la base: buildProjection no consulta nada. */
export interface ProjectionFacts {
  balances: readonly AccountBalance[];
  cards: readonly CreditCard[];
  loans: readonly Loan[];
  rates: readonly ProductRate[];
  expenses: readonly Expense[];
  capitalPayments: readonly CapitalPayment[];
  recurringIncomes: readonly RecurringIncome[];
  oneOffIncomes: readonly OneOffIncome[];
  fixedExpenses: readonly FixedExpense[];
  settings: Settings;
}

/**
 * Más viejo que esto, el saldo ya no sirve de punto de partida: los "próximos meses" serían
 * meses pasados y el semáforo mostraría el pasado como si fuera futuro.
 */
export const MAX_BALANCE_AGE_DAYS = 31;

export interface ProjectionResult {
  /** Fecha del saldo más reciente: desde ahí se proyecta. */
  asOf: Engine.IsoDate;
  /** Días entre `asOf` y hoy (0 si el saldo tiene fecha de hoy o futura). La app puede avisar si es alto. */
  daysSinceBalance: number;
  /** Suma del último saldo confirmado de cada cuenta. */
  openingBalanceCents: Engine.Cents;
  /** Cuentas (product id) cuyo último saldo es más viejo que `asOf`: conviene actualizarlas. */
  staleAccounts: number[];
  months: Engine.MonthSummary[];
  /**
   * Avisos, no errores: deuda sobre ingreso por mes y cupo usado por tarjeta (en `asOf`), cada uno
   * solo si supera su umbral de settings. Sin avisos, la lista va vacía.
   */
  alerts: Engine.Alert[];
}

/**
 * Arma la entrada del motor desde las entidades y llama a project(). Pura: sin base de datos.
 * Cada tarjeta y cada préstamo recibe solo sus propias tasas, compras y abonos.
 * `today` entra como parámetro para que siga siendo pura y se pueda probar.
 * Si el último saldo tiene más de MAX_BALANCE_AGE_DAYS días, responde 409.
 */
export function buildProjection(facts: ProjectionFacts, months: number, today: Engine.IsoDate): ProjectionResult {
  const start = startingPoint(facts.balances);
  const daysSinceBalance = Math.max(0, daysBetween(start.asOf, today));
  if (daysSinceBalance > MAX_BALANCE_AGE_DAYS) {
    throw new ConflictException(`Tu último saldo es del ${start.asOf}, confírmalo para proyectar`);
  }
  const to = endOfMonth(shiftMonths(start.asOf, months - 1, 1));

  const cardIds = new Set(facts.cards.map((c) => c.productId));
  const loanIds = new Set(facts.loans.map((l) => l.productId));
  const ratesOf = (productId: number) => facts.rates.filter((r) => r.productId === productId);

  // Un abono a algo que no es tarjeta ni préstamo no debería existir: el service lo impide
  const orphan = facts.capitalPayments.find((p) => !cardIds.has(p.productId) && !loanIds.has(p.productId));
  if (orphan)
    throw new Error(`el abono ${orphan.id} es al producto ${orphan.productId}, que no es tarjeta ni préstamo`);

  const fixedExpenses = facts.fixedExpenses.map(toFixedExpense);
  // Un gasto con tarjeta es una compra; desde una cuenta sale del disponible ese día
  const cashExpenses = facts.expenses.filter((e) => !cardIds.has(e.sourceProductId)).map(toCashExpense);

  // Cada tarjeta con sus propias compras y abonos: sirven para los eventos y para el cupo usado
  const cards = facts.cards.map((card) => ({
    card: toEngineCard(card, ratesOf(card.productId)),
    purchases: facts.expenses.filter((e) => e.sourceProductId === card.productId).map(toCardPurchase),
    payments: facts.capitalPayments.filter((p) => p.productId === card.productId).map(toCardCapitalPayment),
  }));

  const debtEvents: Engine.CashEvent[] = [
    ...cards.flatMap(({ card, purchases, payments }) =>
      cardEvents(card, purchases, payments, fixedExpenses, start.asOf, to),
    ),
    ...facts.loans.flatMap((loan) =>
      loanEvents(
        toEngineLoan(loan, ratesOf(loan.productId)),
        facts.capitalPayments.filter((p) => p.productId === loan.productId).map(toLoanPrepayment),
        start.asOf,
        to,
      ),
    ),
  ];

  const projected = project(
    {
      asOf: start.asOf,
      openingBalance: start.openingBalanceCents,
      recurringIncomes: facts.recurringIncomes.map(toRecurringIncome),
      oneOffIncomes: facts.oneOffIncomes.map(toOneOffIncome),
      fixedExpenses,
      cashExpenses,
      extraEvents: debtEvents,
      yellowBelowIncomePct: facts.settings.yellowBelowIncomePct,
    },
    months,
  );

  // El cupo usado cuenta también los cargos de los gastos fijos con tarjeta que ya se hicieron
  const { debtToIncomePct, cardUtilizationPct } = toEngineSettings(facts.settings);
  const alerts = [
    ...projected.map((month) => debtToIncomeAlert(month, debtToIncomePct)),
    ...cards.map(({ card, purchases, payments }) => {
      const all = [...purchases, ...fixedExpensesAsPurchases(card, fixedExpenses, start.asOf, start.asOf)];
      return cardUtilizationAlert(card, all, planCard(card, all, payments).rows, start.asOf, cardUtilizationPct);
    }),
  ].filter((alert) => alert !== undefined);

  return {
    asOf: start.asOf,
    daysSinceBalance,
    openingBalanceCents: start.openingBalanceCents,
    staleAccounts: start.staleAccounts,
    months: projected,
    alerts,
  };
}

/** Último saldo de cada cuenta; se proyecta desde el más reciente y se avisa de los más viejos. */
function startingPoint(
  balances: readonly AccountBalance[],
): Pick<ProjectionResult, 'asOf' | 'openingBalanceCents' | 'staleAccounts'> {
  const latest = new Map<number, AccountBalance>();
  for (const b of balances) {
    const current = latest.get(b.productId);
    if (current === undefined || b.asOf > current.asOf) latest.set(b.productId, b);
  }
  if (latest.size === 0) {
    throw new BadRequestException(
      'No hay ningún saldo confirmado: registra el saldo de una cuenta para poder proyectar',
    );
  }

  const rows = [...latest.values()];
  const asOf = rows.reduce((max, b) => (b.asOf > max ? b.asOf : max), rows[0].asOf);
  return {
    asOf,
    openingBalanceCents: rows.reduce((sum, b) => sum + b.balanceCents, 0),
    staleAccounts: rows
      .filter((b) => b.asOf < asOf)
      .map((b) => b.productId)
      .sort((a, b) => a - b),
  };
}
