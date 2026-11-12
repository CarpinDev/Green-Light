import type { ProjectionFacts } from './build-projection';

/**
 * Quita de las filas de la proyección todo lo que cuelga de un producto archivado: su saldo, su tarjeta o préstamo,
 * sus tasas, sus gastos y abonos. Pura. Los gastos fijos y los ingresos que apuntan a un producto no se archivan:
 * la API no deja archivarlo mientras alguien lo use.
 */
export function excludeArchived(facts: ProjectionFacts, archivedIds: ReadonlySet<number>): ProjectionFacts {
  if (archivedIds.size === 0) return facts;
  const live = (productId: number) => !archivedIds.has(productId);
  return {
    ...facts,
    balances: facts.balances.filter((b) => live(b.productId)),
    cards: facts.cards.filter((c) => live(c.productId)),
    loans: facts.loans.filter((l) => live(l.productId)),
    rates: facts.rates.filter((r) => live(r.productId)),
    expenses: facts.expenses.filter((e) => live(e.sourceProductId)),
    capitalPayments: facts.capitalPayments.filter((p) => live(p.productId)),
  };
}
