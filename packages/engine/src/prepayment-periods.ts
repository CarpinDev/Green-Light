import type { IsoDate } from './calendar';
import type { PrepaymentMode } from './amortization';
import type { Cents } from './money';

/** Lo mínimo que necesita un abono para ubicarse en un cronograma. */
export interface DatedPayment {
  id: string;
  date: IsoDate;
  amount: Cents;
  mode: PrepaymentMode;
  /** El dinero no sale de las cuentas (va directo al banco): baja la deuda igual, pero no el disponible. */
  external?: boolean;
}

export interface GroupedPrepayment {
  afterPeriod: number;
  amount: Cents;
  /** Cuánto de `amount` es externo (la suma de los abonos externos del periodo). */
  externalAmount: Cents;
  mode: PrepaymentMode;
  date: IsoDate;
}

/**
 * Ubica cada abono en un periodo. Entra antes de la primera fecha límite posterior a la suya
 * (el mismo día de la fecha límite llega tarde). Varios abonos entre las mismas fechas se suman
 * y mandan la fecha y el modo del último. `notBefore` rechaza abonos anteriores a esa fecha.
 */
export function groupPrepayments(
  deadlines: readonly IsoDate[],
  payments: readonly DatedPayment[],
  notBefore?: IsoDate,
): Map<number, GroupedPrepayment> {
  const grouped = new Map<number, GroupedPrepayment>();
  const ordered = [...payments].sort((a, b) => a.date.localeCompare(b.date));

  for (const p of ordered) {
    if (notBefore !== undefined && p.date < notBefore) {
      throw new RangeError(`el abono ${p.id} (${p.date}) es anterior al inicio (${notBefore})`);
    }
    const afterPeriod = deadlines.filter((d) => d <= p.date).length;
    if (afterPeriod >= deadlines.length) {
      throw new RangeError(`el abono ${p.id} (${p.date}) llega cuando ya no quedan cuotas por pagar`);
    }
    const prev = grouped.get(afterPeriod);
    grouped.set(afterPeriod, {
      afterPeriod,
      amount: (prev?.amount ?? 0) + p.amount,
      externalAmount: (prev?.externalAmount ?? 0) + (p.external === true ? p.amount : 0),
      mode: p.mode,
      date: p.date,
    });
  }
  return grouped;
}
