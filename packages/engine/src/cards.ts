import type Decimal from 'decimal.js';
import { type IsoDate, cutDateFor, daysBetween, dueDateFor, nthCutAfter } from './calendar';
import type { Cents } from './money';
import { type AmortizationMethod, type ScheduleRow, schedule } from './amortization';
import { type Rate, type RateHistory, ZERO_RATE, eaToPeriod } from './rates';

export const MAX_INSTALLMENTS = 72;

/** Cómo se cobra el interés de la primera cuota (de la compra al primer corte). */
export type FirstPeriodInterest = 'full_month' | 'prorated' | 'none';

export interface CreditCard {
  id: string;
  cutDay: number;
  dueDay: number;
  rates: RateHistory;
  minPaymentMethod: AmortizationMethod;
  /** Si es true, las compras a 1 cuota no pagan interés. */
  singleInstallmentInterestFree: boolean;
  firstPeriodInterest: FirstPeriodInterest;
  /** Cupo total de la tarjeta. */
  creditLimit: Cents;
  /** Cargos fijos que se cobran en cada corte. */
  handlingFee: Cents;
  insurance: Cents;
}

export interface CardPurchase {
  id: string;
  cardId: string;
  date: IsoDate;
  amount: Cents;
  installments: number;
  /** Tasa fija de promoción; gana sobre la de la tarjeta durante toda la compra. */
  promoRate?: Rate;
}

export interface PurchaseRow extends ScheduleRow {
  purchaseId: string;
  cardId: string;
  cutDate: IsoDate;
  dueDate: IsoDate;
}

/** Cortes en que se factura cada cuota de la compra. */
export function purchaseCuts(card: CreditCard, purchase: CardPurchase): IsoDate[] {
  assertInstallments(purchase.installments);
  const first = cutDateFor(purchase.date, card.cutDay);
  return Array.from({ length: purchase.installments }, (_, k) => nthCutAfter(first, card.cutDay, k));
}

/** Tasa que paga la cuota facturada en `cutDate`. Prioridad: 1 cuota sin interés > promoción > tarjeta. */
export function purchaseRate(card: CreditCard, purchase: CardPurchase, cutDate: IsoDate): Rate {
  if (purchase.installments === 1 && card.singleInstallmentInterestFree) return ZERO_RATE;
  if (purchase.promoRate !== undefined) return purchase.promoRate;

  return card.rates.rateOn(cutDate);
}

export function planPurchase(card: CreditCard, purchase: CardPurchase): PurchaseRow[] {
  if (purchase.cardId !== card.id) {
    throw new Error(`la compra ${purchase.id} es de la tarjeta ${purchase.cardId}, no de ${card.id}`);
  }

  const cuts = purchaseCuts(card, purchase);
  const rates = cuts.map((cut) => purchaseRate(card, purchase, cut));
  const firstCut = cuts[0];
  const firstRate = rates[0];
  if (firstCut === undefined || firstRate === undefined) {
    throw new Error(`la compra ${purchase.id} no generó cortes`);
  }

  const rows = schedule(
    purchase.amount,
    purchase.installments,
    rates.map((r) => r.mv),
    card.minPaymentMethod,
    { firstPeriodRate: firstPeriodRate(card.firstPeriodInterest, firstRate, purchase.date, firstCut) },
  );

  return rows.map((row, i) => {
    const cutDate = cuts[i];
    if (cutDate === undefined) throw new Error(`no hay corte para la cuota ${i + 1}`);
    return {
      ...row,
      purchaseId: purchase.id,
      cardId: card.id,
      cutDate,
      dueDate: dueDateFor(cutDate, card.dueDay),
    };
  });
}

/** undefined = cobrar el mes completo con la tasa contractual (lo que hace schedule por defecto). */
function firstPeriodRate(
  mode: FirstPeriodInterest,
  rate: Rate,
  purchaseDate: IsoDate,
  firstCut: IsoDate,
): Decimal | undefined {
  switch (mode) {
    case 'full_month':
      return undefined;
    case 'none':
      return ZERO_RATE.mv;
    case 'prorated':
      return eaToPeriod(rate.ea, daysBetween(purchaseDate, firstCut));
  }
}

function assertInstallments(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) {
    throw new RangeError(`installments debe ser un entero entre 1 y ${MAX_INSTALLMENTS}, llegó ${n}`);
  }
}