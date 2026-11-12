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
import { currentBalance } from './current-balance';
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
  /** La fecha de hoy con la que se calculó (la app la muestra sin depender del reloj del celular). */
  today: Engine.IsoDate;
  /** Lo que tienes hoy: el último saldo confirmado más los movimientos que ya pasaron desde entonces. */
  currentBalanceCents: Engine.Cents;
  /** Cuentas (product id) cuyo último saldo es más viejo que `asOf`: conviene actualizarlas. */
  staleAccounts: number[];
  months: Engine.MonthSummary[];
  /**
   * Avisos, no errores: deuda sobre ingreso por mes y cupo usado por tarjeta (en `asOf`), cada uno
   * solo si supera su umbral de settings. Sin avisos, la lista va vacía.
   */
  alerts: Engine.Alert[];
}

/** Lo que armó projectionInput: la entrada del motor y los datos que otros módulos reusan. */
export interface PreparedProjection {
  input: Engine.ProjectionInput;
  daysSinceBalance: number;
  openingBalanceCents: Engine.Cents;
  staleAccounts: number[];
  /** Cada tarjeta con sus propias compras y abonos (ids del motor), incluida la que se dejó fuera. */
  cards: { card: Engine.CreditCard; purchases: Engine.CardPurchase[]; payments: Engine.CapitalPayment[] }[];
  fixedExpenses: Engine.FixedExpense[];
}

/**
 * Arma la entrada del motor desde las entidades. Pura: sin base de datos.
 * Cada tarjeta y cada préstamo recibe solo sus propias tasas, compras y abonos.
 * `today` entra como parámetro para que siga siendo pura y se pueda probar.
 * Valida el saldo: sin ninguno es 400, y si el último tiene más de MAX_BALANCE_AGE_DAYS días, 409.
 * Con `withoutCardId` deja fuera los eventos de esa tarjeta (el simulador los agrega con y sin la compra).
 */
export function projectionInput(
  facts: ProjectionFacts,
  months: number,
  today: Engine.IsoDate,
  withoutCardId?: number,
): Engine.ProjectionInput {
  return prepareProjection(facts, months, today, withoutCardId).input;
}

/** buildProjection: arma la entrada, proyecta y revisa los umbrales de alerta. */
export function buildProjection(facts: ProjectionFacts, months: number, today: Engine.IsoDate): ProjectionResult {
  const prepared = prepareProjection(facts, months, today);
  const projected = project(prepared.input, months);
  return {
    asOf: prepared.input.asOf,
    daysSinceBalance: prepared.daysSinceBalance,
    openingBalanceCents: prepared.openingBalanceCents,
    today,
    currentBalanceCents: currentBalance(prepared.openingBalanceCents, projected, today),
    staleAccounts: prepared.staleAccounts,
    months: projected,
    alerts: alertsOf(prepared, projected, toEngineSettings(facts.settings)),
  };
}

export function prepareProjection(
  facts: ProjectionFacts,
  months: number,
  today: Engine.IsoDate,
  withoutCardId?: number,
): PreparedProjection {
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
  // Lo del día del saldo cuenta solo si se registró después de confirmarlo (el motor recibe el booleano).
  // Fuera de esto, a propósito: los abonos a capital y los recurrentes (salario, fijos) de ese día siguen
  // dándose por incluidos en el saldo.
  const afterBalance = (date: Engine.IsoDate, createdAt: Date) =>
    date === start.asOf && createdAt > start.balanceCreatedAt;
  const cashExpenses = facts.expenses
    .filter((e) => !cardIds.has(e.sourceProductId))
    .map((e) => toCashExpense(e, afterBalance(e.date, e.createdAt)));

  // Cada tarjeta con sus propias compras y abonos: sirven para los eventos y para el cupo usado
  const cards = facts.cards.map((card) => ({
    productId: card.productId,
    card: toEngineCard(card, ratesOf(card.productId)),
    purchases: facts.expenses.filter((e) => e.sourceProductId === card.productId).map(toCardPurchase),
    payments: facts.capitalPayments.filter((p) => p.productId === card.productId).map(toCardCapitalPayment),
  }));

  const debtEvents: Engine.CashEvent[] = [
    ...cards
      .filter((c) => c.productId !== withoutCardId)
      .flatMap(({ card, purchases, payments }) => cardEvents(card, purchases, payments, fixedExpenses, start.asOf, to)),
    ...facts.loans.flatMap((loan) =>
      loanEvents(
        toEngineLoan(loan, ratesOf(loan.productId)),
        facts.capitalPayments.filter((p) => p.productId === loan.productId).map(toLoanPrepayment),
        start.asOf,
        to,
      ),
    ),
  ];

  return {
    input: {
      asOf: start.asOf,
      openingBalance: start.openingBalanceCents,
      recurringIncomes: facts.recurringIncomes.map(toRecurringIncome),
      oneOffIncomes: facts.oneOffIncomes.map((i) => toOneOffIncome(i, afterBalance(i.date, i.createdAt))),
      fixedExpenses,
      cashExpenses,
      extraEvents: debtEvents,
      yellowBelowIncomePct: facts.settings.yellowBelowIncomePct,
    },
    daysSinceBalance,
    openingBalanceCents: start.openingBalanceCents,
    staleAccounts: start.staleAccounts,
    cards: cards.map(({ card, purchases, payments }) => ({ card, purchases, payments })),
    fixedExpenses,
  };
}

/** Deuda sobre ingreso por mes y cupo usado por tarjeta; el cupo cuenta los cargos fijos ya hechos. */
function alertsOf(
  { input, cards, fixedExpenses }: PreparedProjection,
  projected: readonly Engine.MonthSummary[],
  { debtToIncomePct, cardUtilizationPct }: Engine.Settings,
): Engine.Alert[] {
  return [
    ...projected.map((month) => debtToIncomeAlert(month, debtToIncomePct)),
    ...cards.map(({ card, purchases, payments }) => {
      const all = [...purchases, ...fixedExpensesAsPurchases(card, fixedExpenses, input.asOf, input.asOf)];
      return cardUtilizationAlert(card, all, planCard(card, all, payments).rows, input.asOf, cardUtilizationPct);
    }),
  ].filter((alert) => alert !== undefined);
}

/**
 * Último saldo de cada cuenta; se proyecta desde el más reciente y se avisa de los más viejos.
 * `balanceCreatedAt` es la hora de registro del saldo que fija `asOf` (si dos cuentas comparten esa
 * fecha, la del más reciente): lo registrado ese día antes de esa hora ya está dentro del saldo.
 */
function startingPoint(
  balances: readonly AccountBalance[],
): Pick<ProjectionResult, 'asOf' | 'openingBalanceCents' | 'staleAccounts'> & { balanceCreatedAt: Date } {
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
  const balanceCreatedAt = rows
    .filter((b) => b.asOf === asOf)
    .reduce((latest, b) => (b.createdAt > latest ? b.createdAt : latest), new Date(0));
  return {
    asOf,
    balanceCreatedAt,
    openingBalanceCents: rows.reduce((sum, b) => sum + b.balanceCents, 0),
    staleAccounts: rows
      .filter((b) => b.asOf < asOf)
      .map((b) => b.productId)
      .sort((a, b) => a - b),
  };
}
