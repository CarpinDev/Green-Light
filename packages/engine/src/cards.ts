import type Decimal from 'decimal.js';
import { type IsoDate, cutDateFor, daysBetween, dueDateFor, nthCutAfter } from './calendar';
import type { Cents } from './money';
import { type AmortizationMethod, type PrepaymentMode, type ScheduleRow, schedule } from './amortization';
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

/** Abono extraordinario a capital. Sin `purchaseId` queda sin asignar y lo reparte `planCard`. */
export interface CapitalPayment {
  id: string;
  cardId: string;
  purchaseId?: string;
  date: IsoDate;
  amount: Cents;
  mode: PrepaymentMode;
}

export interface PurchaseRow extends ScheduleRow {
  purchaseId: string;
  cardId: string;
  cutDate: IsoDate;
  dueDate: IsoDate;
  /** Fecha en que se hizo el abono de esta cuota (la del último si hubo varios). */
  prepaymentDate?: IsoDate;
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

export function planPurchase(
  card: CreditCard,
  purchase: CardPurchase,
  payments: readonly CapitalPayment[] = [],
): PurchaseRow[] {
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

  const grouped = groupPayments(purchase, cuts, payments);

  const rows = schedule(
    purchase.amount,
    purchase.installments,
    rates.map((r) => r.mv),
    card.minPaymentMethod,
    {
      firstPeriodRate: firstPeriodRate(card.firstPeriodInterest, firstRate, purchase.date, firstCut),
      prepayments: [...grouped.values()].map((g) => ({
        afterPeriod: g.afterPeriod,
        amount: g.amount,
        mode: g.mode,
      })),
    },
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

interface GroupedPayment {
  afterPeriod: number;
  amount: Cents;
  mode: PrepaymentMode;
  date: IsoDate;
}

/**
 * Un abono entra en la primera cuota cuyo corte es posterior a su fecha (el mismo día del corte llega
 * tarde). Varios abonos entre los mismos cortes se suman y mandan la fecha y el modo del último.
 */
function groupPayments(
  purchase: CardPurchase,
  cuts: readonly IsoDate[],
  payments: readonly CapitalPayment[],
): Map<number, GroupedPayment> {
  const grouped = new Map<number, GroupedPayment>();
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  for (const p of ordered) {
    if (p.purchaseId !== purchase.id || p.cardId !== purchase.cardId) {
      throw new Error(`el abono ${p.id} no es de la compra ${purchase.id}`);
    }
    if (p.date < purchase.date) {
      throw new RangeError(`el abono ${p.id} (${p.date}) es anterior a la compra (${purchase.date})`);
    }
    const afterPeriod = cuts.filter((cut) => cut <= p.date).length;
    if (afterPeriod >= cuts.length) {
      throw new RangeError(`el abono ${p.id} (${p.date}) llega cuando todas las cuotas ya se facturaron`);
    }
    const prev = grouped.get(afterPeriod);
    grouped.set(afterPeriod, {
      afterPeriod,
      amount: (prev?.amount ?? 0) + p.amount,
      mode: p.mode,
      date: p.date,
    });
  }
  return grouped;
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