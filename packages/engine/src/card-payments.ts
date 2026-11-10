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
 * `rows` son las cuotas de una sola compra y solo deben traer abonos hechos hasta `date`.
 */
export function unbilledBalance(rows: readonly PurchaseRow[], date: IsoDate): Cents {
  return rows.find((r) => r.cutDate > date)?.openingBalance ?? 0;
}

export interface CardPlan {
  rows: PurchaseRow[];
  /** Abonos sin compra asignada que no cupieron en ninguna deuda abonable. */
  unapplied: CapitalPayment[];
}

/**
 * Plan de todas las compras de la tarjeta. Los abonos se procesan en orden cronológico:
 * los asignados van a su compra y los demás se reparten primero a la compra de mayor tasa
 * y, a igual tasa, a la más antigua. Así cada abono ve lo que dejaron los anteriores.
 */
export function planCard(
  card: CreditCard,
  purchases: readonly CardPurchase[],
  payments: readonly CapitalPayment[],
): CardPlan {
  const own = purchases.filter((p) => p.cardId === card.id);
  const byPurchase = new Map<string, CapitalPayment[]>(own.map((p) => [p.id, []]));

  const chronological = payments
    .filter((p) => p.cardId === card.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const pay of chronological) {
    if (pay.purchaseId !== undefined && !byPurchase.has(pay.purchaseId)) {
      throw new Error(`el abono ${pay.id} apunta a la compra ${pay.purchaseId}, que no existe en la tarjeta ${card.id}`);
    }
  }

  const rowsOf = (purchase: CardPurchase): PurchaseRow[] =>
    planPurchase(card, purchase, byPurchase.get(purchase.id) ?? []);

  const unapplied: CapitalPayment[] = [];

  for (const pay of chronological) {
    if (pay.purchaseId !== undefined) {
      byPurchase.get(pay.purchaseId)?.push(pay);
      continue;
    }

    let remaining = pay.amount;
    for (const purchase of byRatePriority(card, own, pay.date)) {
      if (remaining === 0) break;
      const applied = Math.min(remaining, unbilledBalance(rowsOf(purchase), pay.date));
      if (applied <= 0) continue;

      byPurchase.get(purchase.id)?.push({ ...pay, purchaseId: purchase.id, amount: applied });
      remaining -= applied;
    }

    if (remaining > 0) unapplied.push({ ...pay, amount: remaining });
  }

  return { rows: own.flatMap(rowsOf), unapplied };
}

/**
 * Compras abonables en `date`, de mayor a menor tasa del próximo corte (la que de verdad se ahorra);
 * a igual tasa, la más antigua. Las que ya no tienen cortes por facturar no se pueden abonar.
 */
function byRatePriority(card: CreditCard, purchases: readonly CardPurchase[], date: IsoDate): CardPurchase[] {
  return purchases
    .filter((p) => p.date <= date)
    .flatMap((purchase) => {
      const cut = purchaseCuts(card, purchase).find((c) => c > date);
      return cut === undefined ? [] : [{ purchase, rate: purchaseRate(card, purchase, cut).mv }];
    })
    .sort(
      (a, b) =>
        b.rate.comparedTo(a.rate) ||
        a.purchase.date.localeCompare(b.purchase.date) ||
        a.purchase.id.localeCompare(b.purchase.id),
    )
    .map((x) => x.purchase);
}
