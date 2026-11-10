import Decimal from 'decimal.js';
import type { IsoDate } from './calendar';
import type { CardPurchase, CreditCard, PurchaseRow } from './cards';
import { sumBy } from './collections';
import type { MonthSummary } from './projection';
import { utilization } from './statement';

export interface Settings {
  /** El mes es amarillo si cierra con menos de esta fracción del ingreso. */
  readonly yellowBelowIncomePct: Decimal;
  /** Alerta si el cupo usado de una tarjeta la supera. */
  readonly cardUtilizationPct: Decimal;
  /** Alerta si los pagos de deuda del mes superan esta fracción del ingreso. */
  readonly debtToIncomePct: Decimal;
  /** Diferencia aceptable entre el mínimo calculado y el del banco. */
  readonly statementTolerancePct: Decimal;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  yellowBelowIncomePct: new Decimal('0.10'),
  cardUtilizationPct: new Decimal('0.30'),
  debtToIncomePct: new Decimal('0.30'),
  statementTolerancePct: new Decimal('0.02'),
});

/** Un aviso para mostrar en la app; no es un error. */
export interface Alert {
  kind: 'card_utilization' | 'debt_to_income';
  /** La tarjeta o el mes (YYYY-MM) al que se refiere. */
  refId: string;
  /** Proporción medida, con 4 decimales. */
  value: Decimal;
  threshold: Decimal;
}

/** Alerta si el cupo usado de la tarjeta en `on` supera el umbral (igualarlo no alerta). */
export function cardUtilizationAlert(
  card: CreditCard,
  purchases: readonly CardPurchase[],
  rows: readonly PurchaseRow[],
  on: IsoDate,
  threshold: Decimal,
): Alert | undefined {
  return exceeds('card_utilization', card.id, utilization(card, purchases, rows, on), threshold);
}

/**
 * Alerta si los pagos obligatorios de deuda del mes (mínimos de tarjeta y cuotas de préstamo) superan
 * el umbral del ingreso del mes. Los abonos a capital son voluntarios y no cuentan.
 */
export function debtToIncomeAlert(month: MonthSummary, threshold: Decimal): Alert | undefined {
  const debt = -sumBy(
    month.events.filter((e) => e.kind === 'card_payment' || e.kind === 'loan_payment'),
    (e) => e.amount,
  );
  if (debt <= 0) return undefined;

  // Con deudas y sin ingreso la proporción es infinita
  const ratio = month.referenceIncome > 0 ? new Decimal(debt).div(month.referenceIncome) : new Decimal(Infinity);
  return exceeds('debt_to_income', month.month, ratio, threshold);
}

function exceeds(kind: Alert['kind'], refId: string, value: Decimal, threshold: Decimal): Alert | undefined {
  if (!value.gt(threshold)) return undefined;
  return { kind, refId, value: value.toDecimalPlaces(4), threshold };
}
