import { type IsoDate, cutDateFor, dueDateFor, nthCutAfter, shiftMonths } from './calendar';
import type { CapitalPayment, CardPurchase, CreditCard } from './cards';
import { planCard } from './card-payments';
import { type Loan, type LoanPrepayment, loanSchedule } from './loans';
import { type CashEvent, type ConfirmedPayment, type FixedExpense, monthlyDates } from './projection';
import type { Cents } from './money';
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
  confirmed: readonly ConfirmedPayment[] = [],
): CashEvent[] {
  const { rows } = planCard(card, [...purchases, ...fixedExpensesAsPurchases(card, fixed, from, to)], payments);
  const events: CashEvent[] = [];

  // Se corta por el corte y no por el vencimiento: un pago adelantado cae en el rango aunque su `due` no
  for (let cut = cutDateFor(lookBack(from), card.cutDay); cut <= to; cut = nthCutAfter(cut, card.cutDay, 1)) {
    const due = dueDateFor(cut, card.dueDay);
    const paid = confirmed.find((c) => c.scheduledDate === cut);
    // Sin confirmar, el pago supuesto sigue saliendo el día del vencimiento
    if (paid === undefined && (due <= from || due > to)) continue;

    const { minimum, fullPayment } = statement(card, rows, cut);

    if (paid !== undefined) {
      events.push(
        ...confirmedEvents(paid, minimum.total, {
          kind: 'card_payment',
          label: `Pago tarjeta (corte ${cut})`,
          refId: card.id,
          extra: { cutDate: cut, fullPayment: fullPayment.total },
          nextDue: dueDateFor(nthCutAfter(cut, card.cutDay, 1), card.dueDay),
          pendingLabel: `Pendiente del corte ${cut}`,
          from,
          to,
        }),
      );
      continue;
    }

    if (minimum.total > 0) {
      events.push({
        date: due,
        kind: 'card_payment',
        amount: -minimum.total,
        label: `Pago mínimo tarjeta (corte ${cut})`,
        refId: card.id,
        cutDate: cut,
        scheduledDate: cut,
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
  confirmed: readonly ConfirmedPayment[] = [],
): CashEvent[] {
  const rows = loanSchedule(loan, prepayments);

  const installments = rows.flatMap((r, i): CashEvent[] => {
    const paid = confirmed.find((c) => c.scheduledDate === r.dueDate);
    if (paid !== undefined) {
      // El faltante va a la cuota siguiente; en la última no la hay y pasa al mes después
      const nextDue = rows[i + 1]?.dueDate ?? shiftMonths(r.dueDate, 1, Number(r.dueDate.slice(8)));
      return confirmedEvents(paid, r.total, {
        kind: 'loan_payment',
        label: `Cuota ${r.period} préstamo`,
        refId: loan.id,
        extra: {},
        nextDue,
        pendingLabel: `Pendiente de la cuota ${r.period}`,
        from,
        to,
      });
    }
    if (r.total <= 0 || !inWindow(r.dueDate, from, to)) return [];
    return [
      {
        date: r.dueDate,
        kind: 'loan_payment',
        amount: -r.total,
        label: `Cuota ${r.period} préstamo`,
        refId: loan.id,
        scheduledDate: r.dueDate,
      },
    ];
  });

  return [...installments, ...capitalPayments(rows, from, to, 'Abono a capital préstamo', () => loan.id)];
}

interface ConfirmedDebtSpec {
  kind: 'card_payment' | 'loan_payment';
  label: string;
  refId: string;
  /** Campos propios del tipo de deuda (corte y pago total de la tarjeta). */
  extra: Pick<CashEvent, 'cutDate' | 'fullPayment'>;
  /** Fecha del siguiente pago programado: ahí cae lo que faltó por pagar. */
  nextDue: IsoDate;
  pendingLabel: string;
  from: IsoDate;
  to: IsoDate;
}

/**
 * Los eventos de un pago confirmado de una deuda: el pago real (en su fecha y monto reales, que es lo que reemplaza
 * al supuesto) y, si fue menor al mínimo, el faltante en el siguiente pago programado. Uno externo baja la deuda
 * pero no sale del disponible: no genera ninguno. Lo que cae antes del saldo ya está dentro de él y tampoco cuenta;
 * el supuesto desaparece igual porque aquí nunca se emite.
 */
function confirmedEvents(paid: ConfirmedPayment, minimum: Cents, spec: ConfirmedDebtSpec): CashEvent[] {
  if (paid.external === true) return [];
  const events: CashEvent[] = [];
  const settled = paid.afterBalance === true ? paid.date >= spec.from : paid.date > spec.from;
  if (settled && paid.date <= spec.to) {
    events.push({
      date: paid.date,
      kind: spec.kind,
      amount: -paid.amount,
      label: spec.label,
      refId: spec.refId,
      scheduledDate: paid.scheduledDate,
      confirmed: true,
      ...spec.extra,
      ...(paid.afterBalance === true && { afterBalance: true }),
    });
  }
  // No se modela la mora: lo que faltó se proyecta tal cual para que la proyección no quede optimista
  if (paid.amount < minimum && inWindow(spec.nextDue, spec.from, spec.to)) {
    events.push({
      date: spec.nextDue,
      kind: spec.kind,
      amount: -(minimum - paid.amount),
      label: spec.pendingLabel,
      refId: spec.refId,
    });
  }
  return events;
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
