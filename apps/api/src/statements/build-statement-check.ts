import { BadRequestException } from '@nestjs/common';
import { compareMinimum, cutDateFor, fixedExpensesAsPurchases, planCard, statement } from '@greenlight/engine';
import type * as Engine from '@greenlight/engine';
import type { CreditCard } from '../products/entities/credit-card.entity';
import type { ProjectionFacts } from '../projection/build-projection';
import {
  toCardCapitalPayment,
  toCardPurchase,
  toEngineCard,
  toEngineSettings,
  toFixedExpense,
} from '../projection/mappers';

/** La tarjeta y las filas que necesita para armar su extracto. */
export type StatementFacts = Pick<
  ProjectionFacts,
  'rates' | 'expenses' | 'capitalPayments' | 'fixedExpenses' | 'settings'
> & {
  card: CreditCard;
};

/** Lo que dice el extracto del banco (centavos). */
export interface StatementCheckInput {
  /** Fecha de corte del extracto. */
  cutDate: Engine.IsoDate;
  statementMinimumCents: Engine.Cents;
  statementTotalCents?: Engine.Cents;
}

export interface StatementCheckResult {
  /** El extracto que calcula el motor para ese corte. */
  statement: Engine.Statement;
  /** El mínimo calculado contra el del banco, con la tolerancia de settings. */
  check: Engine.StatementCheck;
}

/**
 * Arma el extracto de un corte y compara su mínimo con el del banco. Pura, sin base de datos.
 * Es el mismo cálculo de las alertas: las compras y abonos de esta tarjeta más los cargos de gastos
 * fijos con ella. Todo dato que no cuadra es un 400.
 */
export function buildStatementCheck(
  facts: StatementFacts,
  input: StatementCheckInput,
  today: Engine.IsoDate,
): StatementCheckResult {
  const { card: row, settings } = facts;
  const { cutDate, statementMinimumCents, statementTotalCents } = input;

  // El motor lanzaría un RangeError (500) con una fecha que no es de corte: aquí es un 400 útil
  const expected = cutDateFor(cutDate, row.cutDay);
  if (expected !== cutDate) {
    throw new BadRequestException(
      `${cutDate} no es una fecha de corte: esta tarjeta corta el día ${row.cutDay}, ¿quisiste decir ${expected}?`,
    );
  }
  if (cutDate > today) {
    throw new BadRequestException(`El corte del ${cutDate} todavía no llega: el extracto no existe aún`);
  }
  if (statementTotalCents !== undefined && statementTotalCents < statementMinimumCents) {
    throw new BadRequestException(
      `El pago total (${statementTotalCents}) no puede ser menor que el mínimo (${statementMinimumCents})`,
    );
  }

  const card = toEngineCard(
    row,
    facts.rates.filter((r) => r.productId === row.productId),
  );
  const own = facts.expenses.filter((e) => e.sourceProductId === row.productId).map(toCardPurchase);
  const payments = facts.capitalPayments.filter((p) => p.productId === row.productId).map(toCardCapitalPayment);
  // Los cargos de los gastos fijos con esta tarjeta también se facturan, como en las alertas
  const fixed = fixedExpensesAsPurchases(card, facts.fixedExpenses.map(toFixedExpense), cutDate, cutDate);

  const extract = statement(card, planCard(card, [...own, ...fixed], payments).rows, cutDate);
  const { statementTolerancePct } = toEngineSettings(settings);
  return {
    statement: extract,
    check: compareMinimum(extract.minimum.total, statementMinimumCents, statementTolerancePct),
  };
}
