import Decimal from 'decimal.js';
import type { IsoDate } from './calendar';
import type { Cents } from './money';
import {
  type CapitalPayment,
  type CardPurchase,
  type CreditCard,
  type PurchaseRow,
  planPurchase,
  purchaseCuts,
  purchaseRate,
} from './cards';

/**
 * Capital de una compra que se puede abonar en `date`: lo que aún no se ha facturado.
 * `rows` son las cuotas de una sola compra.
 */
export function unbilledBalance(rows: readonly PurchaseRow[], date: IsoDate): Cents {
  const next = rows.find((r) => r.cutDate > date);
  if (next === undefined) return 0;
  // Un abono de esa cuota hecho después de `date` todavía no ha pasado
  const paidLater = next.prepayment > 0 && (next.prepaymentDate ?? next.dueDate) > date;
  return next.openingBalance + (paidLater ? next.prepayment : 0);
}

export interface CardPlan {
  rows: PurchaseRow[];
  /** Abonos sin compra asignada que no cupieron en ninguna deuda abonable. */
  unapplied: CapitalPayment[];
}

/**
 * Plan de todas las compras de la tarjeta. Los abonos sin compra asignada se reparten
 * en orden cronológico: primero la compra de mayor tasa y, a igual tasa, la más antigua.
 */
export function planCard(
  card: CreditCard,
  purchases: readonly CardPurchase[],
  payments: readonly CapitalPayment[],
): CardPlan {
  const own = purchases.filter((p) => p.cardId === card.id);
  const ownPayments = payments.filter((p) => p.cardId === card.id);

  const byPurchase = new Map<string, CapitalPayment[]>(own.map((p) => [p.id, []]));
  const unassigned: CapitalPayment[] = [];
  for (const pay of ownPayments) {
    if (pay.purchaseId === undefined) {
      unassigned.push(pay);
      continue;
    }
    const list = byPurchase.get(pay.purchaseId);
    if (list === undefined) {
      throw new Error(`el abono ${pay.id} apunta a la compra ${pay.purchaseId}, que no existe en la tarjeta ${card.id}`);
    }
    list.push(pay);
  }

  const rowsOf = (purchase: CardPurchase): PurchaseRow[] =>
    planPurchase(card, purchase, byPurchase.get(purchase.id) ?? []);

  const unapplied: CapitalPayment[] = [];
  const chronological = [...unassigned].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const pay of chronological) {
    let remaining = pay.amount;

    for (const purchase of byRatePriority(card, own, pay.date)) {
      if (remaining === 0) break;
      const capacity = unbilledBalance(rowsOf(purchase), pay.date);
      const applied = Math.min(remaining, capacity);
      if (applied <= 0) continue;

      byPurchase.get(purchase.id)?.push({ ...pay, purchaseId: purchase.id, amount: applied });
      remaining -= applied;
    }

    if (remaining > 0) unapplied.push({ ...pay, amount: remaining });
  }

  return { rows: own.flatMap(rowsOf), unapplied };
}

/** Compras ya hechas en `date`, de mayor a menor tasa del próximo corte; a igual tasa, la más antigua. */
function byRatePriority(card: CreditCard, purchases: readonly CardPurchase[], date: IsoDate): CardPurchase[] {
  const rateOf = (purchase: CardPurchase): Decimal => {
    const cut = purchaseCuts(card, purchase).find((c) => c > date);
    return cut === undefined ? new Decimal(-1) : purchaseRate(card, purchase, cut).mv;
  };

  return purchases
    .filter((p) => p.date <= date)
    .map((purchase) => ({ purchase, rate: rateOf(purchase) }))
    .sort((a, b) => b.rate.comparedTo(a.rate) || a.purchase.date.localeCompare(b.purchase.date))
    .map((x) => x.purchase);
}
