import Decimal from 'decimal.js';
import type { IsoDate } from './calendar';
import type { CreditCard, PurchaseRow } from './cards';
import type { Cents } from './money';
import { statement } from './statement';

/** ¿El motor calcula el mismo mínimo que el banco? Aquí se delatan los supuestos del modelo. */
export interface StatementCheck {
  calculatedMinimum: Cents;
  bankMinimum: Cents;
  /** calculado − banco: positiva si el motor calcula más. */
  difference: Cents;
  /** |diferencia| / banco, con 4 decimales. Infinito si el banco dice 0 y el motor no. */
  relativeDifference: Decimal;
  withinTolerance: boolean;
}

/** Compara el mínimo calculado con el del banco. Está dentro si la diferencia relativa es ≤ `tolerance`. */
export function compareMinimum(calculated: Cents, bank: Cents, tolerance: Decimal): StatementCheck {
  assertCents(calculated, 'el mínimo calculado');
  assertCents(bank, 'el mínimo del banco');

  const difference = calculated - bank;
  // Si el banco cobra 0, solo coincide si el motor también da 0
  const relative =
    bank === 0
      ? new Decimal(difference === 0 ? 0 : Infinity)
      : new Decimal(Math.abs(difference)).div(bank);

  return {
    calculatedMinimum: calculated,
    bankMinimum: bank,
    difference,
    relativeDifference: relative.toDecimalPlaces(4),
    withinTolerance: relative.lte(tolerance),
  };
}

/** Arma el extracto del corte y compara su mínimo con el que informa el banco. */
export function checkStatement(
  card: CreditCard,
  rows: readonly PurchaseRow[],
  cutDate: IsoDate,
  bankMinimum: Cents,
  tolerance: Decimal,
): StatementCheck {
  return compareMinimum(statement(card, rows, cutDate).minimum.total, bankMinimum, tolerance);
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} debe ser un entero de centavos >= 0, llegó ${value}`);
  }
}
