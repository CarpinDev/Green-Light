import { type IsoDate, cutDateFor, dueDateFor, nthCutAfter, shiftMonths } from './calendar';
import type { CapitalPayment, CardPurchase, CreditCard } from './cards';
import { planCard } from './card-payments';
import { type Loan, type LoanPrepayment, loanSchedule } from './loans';
import { type CashEvent, type FixedExpense, monthlyDates } from './projection';
import { statement } from './statement';

/**
 * Lo que vence o se paga en (from, to] y sale del disponible. `from` es el asOf de la proyección:
 * lo de ese mismo día ya está en el saldo.
 */
const inWindow = (date: IsoDate, from: IsoDate, to: IsoDate): boolean => date > from && date <= to;

/** Un cargo de enero se factura en el corte de febrero y se paga en marzo: hay que mirar 2 meses atrás. */
const lookBack = (from: IsoDate): IsoDate => shiftMonths(from, -2, 1);

/** Cada cargo mensual de un gasto fijo con esta tarjeta, como una compra a 1 cuota. */
export function fixedExpensesAsPurchases(
  card: CreditCard,
  fixed: readonly FixedExpense[],
  from: IsoDate,
  to: IsoDate,
): CardPurchase[] {
  return fixed
    .filter((exp) => exp.cardId === card.id)
    .flatMap((exp) =>
      monthlyDates(exp.day, exp.start, exp.end, lookBack(from), to).map((date) => ({
        id: `${exp.id}@${date}`,
        cardId: card.id,
        date,
        amount: exp.amount,
        installments: 1,
      })),
    );
}

/**
 * Salidas del disponible por una tarjeta: el pago mínimo de cada extracto que vence en (from, to]
 * y los abonos a capital hechos en ese rango. Los abonos que el motor no pudo aplicar no salen.
 */
export function cardEvents(
  card: CreditCard,
  purchases: readonly CardPurchase[],
  payments: readonly CapitalPayment[],
  fixed: readonly FixedExpense[],
  from: IsoDate,
  to: IsoDate,
): CashEvent[] {
  const { rows } = planCard(card, [...purchases, ...fixedExpensesAsPurchases(card, fixed, from, to)], payments);
  const events: CashEvent[] = [];

  for (let cut = cutDateFor(lookBack(from), card.cutDay); ; cut = nthCutAfter(cut, card.cutDay, 1)) {
    const due = dueDateFor(cut, card.dueDay);
    if (due > to) break;
    if (due <= from) continue;

    const { minimum, fullPayment } = statement(card, rows, cut);
    if (minimum.total > 0) {
      events.push({
        date: due,
        kind: 'card_payment',
        amount: -minimum.total,
        label: `Pago mínimo tarjeta (corte ${cut})`,
        refId: card.id,
        cutDate: cut,
        fullPayment: fullPayment.total,
      });
    }
  }

  events.push(...capitalPayments(rows, from, to, 'Abono a capital tarjeta', (r) => r.purchaseId));
  return events;
}

/** Salidas del disponible por un préstamo: cada cuota (con seguro) y cada abono a capital en (from, to]. */
export function loanEvents(
  loan: Loan,
  prepayments: readonly LoanPrepayment[],
  from: IsoDate,
  to: IsoDate,
): CashEvent[] {
  const rows = loanSchedule(loan, prepayments);

  const installments: CashEvent[] = rows
    .filter((r) => r.total > 0 && inWindow(r.dueDate, from, to))
    .map((r) => ({
      date: r.dueDate,
      kind: 'loan_payment',
      amount: -r.total,
      label: `Cuota ${r.period} préstamo`,
      refId: loan.id,
    }));

  return [...installments, ...capitalPayments(rows, from, to, 'Abono a capital préstamo', () => loan.id)];
}

interface PrepaidRow {
  prepayment: number;
  prepaymentDate?: IsoDate;
  externalPrepayment?: number;
}

/**
 * Un capital_payment por cada abono hecho en (from, to], el día en que se hizo. Sale del disponible solo lo que
 * no es externo; si todo el abono fue externo no hay evento. Se calcula sobre las filas (lo que el motor sí aplicó),
 * no sobre el abono original: uno que no cupo en ninguna deuda no inventa plata.
 */
function capitalPayments<R extends PrepaidRow>(
  rows: readonly R[],
  from: IsoDate,
  to: IsoDate,
  label: string,
  refId: (row: R) => string,
): CashEvent[] {
  return rows.flatMap((r) => {
    const fromCash = r.prepayment - (r.externalPrepayment ?? 0);
    return fromCash > 0 && r.prepaymentDate !== undefined && inWindow(r.prepaymentDate, from, to)
      ? [{ date: r.prepaymentDate, kind: 'capital_payment' as const, amount: -fromCash, label, refId: refId(r) }]
      : [];
  });
}
