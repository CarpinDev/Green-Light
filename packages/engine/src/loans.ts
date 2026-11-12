import Decimal from 'decimal.js';
import { type IsoDate, dayOfMonth, shiftMonths } from './calendar';
import { type Cents, roundCents } from './money';
import type { RateHistory } from './rates';
import { type AmortizationMethod, type PrepaymentMode, type ScheduleRow, schedule } from './amortization';
import { groupPrepayments } from './prepayment-periods';

/** Para un préstamo que ya venías pagando, `principal` es el saldo actual y `termMonths` las cuotas que faltan. */
export interface Loan {
  id: string;
  principal: Cents;
  termMonths: number;
  firstPaymentDate: IsoDate;
  rates: RateHistory;
  method: AmortizationMethod;
  /** Cuota que informa el banco; solo con cuota fija. Si falta, se calcula. */
  fixedPayment?: Cents;
  /** Seguro fijo que se cobra con cada cuota. Si el seguro es un porcentaje del saldo, 0 y se usa `insuranceRate`. */
  insurance: Cents;
  /**
   * Seguro como tasa mensual sobre el saldo de capital al inicio del periodo (el de Rappi baja cada mes porque
   * el saldo baja). Con ella, el seguro de cada fila es `round(openingBalance × insuranceRate)`. No puede venir
   * junto con un `insurance` fijo. Va fuera de la cuota fija: no cambia el capital ni el interés.
   */
  insuranceRate?: Decimal;
}

export interface LoanPrepayment {
  id: string;
  loanId: string;
  date: IsoDate;
  amount: Cents;
  mode: PrepaymentMode;
  /** El dinero no sale de las cuentas: baja la deuda igual, pero no el disponible. */
  external?: boolean;
}

export interface LoanRow extends ScheduleRow {
  loanId: string;
  dueDate: IsoDate;
  insurance: Cents;
  /** payment + insurance. */
  total: Cents;
  /** Fecha en que se hizo el abono de esta cuota (la del último si hubo varios). */
  prepaymentDate?: IsoDate;
  /** Cuánto de `prepayment` fue externo (no sale del disponible). */
  externalPrepayment?: Cents;
}

/** Fechas de pago: una por mes con el día de `firstPaymentDate` (se recorta en los meses cortos). */
export function loanDueDates(loan: Loan): IsoDate[] {
  if (!Number.isInteger(loan.termMonths) || loan.termMonths < 1) {
    throw new RangeError(`termMonths debe ser un entero >= 1, llegó ${loan.termMonths}`);
  }
  const day = dayOfMonth(loan.firstPaymentDate);
  return Array.from({ length: loan.termMonths }, (_, k) => shiftMonths(loan.firstPaymentDate, k, day));
}

/**
 * Cronograma del préstamo. Cada cuota usa la tasa vigente al inicio de su periodo
 * (un mes antes de su fecha de pago), que es como el banco fija una tasa variable. Si la primera tasa registrada
 * es posterior a ese inicio (un préstamo que ya venía en curso y se registró hoy), rige desde la primera cuota.
 */
export function loanSchedule(loan: Loan, prepayments: readonly LoanPrepayment[] = []): LoanRow[] {
  for (const p of prepayments) {
    if (p.loanId !== loan.id) {
      throw new Error(`el abono ${p.id} es del préstamo ${p.loanId}, no de ${loan.id}`);
    }
  }

  if (loan.insuranceRate !== undefined && loan.insurance > 0) {
    throw new Error(`el préstamo ${loan.id} trae seguro fijo y seguro por tasa a la vez: solo uno`);
  }
  if (loan.insuranceRate !== undefined && (!loan.insuranceRate.isFinite() || loan.insuranceRate.isNegative())) {
    throw new RangeError(`tasa de seguro inválida: ${loan.insuranceRate.toString()}`);
  }

  const dueDates = loanDueDates(loan);
  const day = dayOfMonth(loan.firstPaymentDate);
  const grouped = groupPrepayments(dueDates, prepayments);
  const rates = dueDates.map((due) => loan.rates.rateOnOrFirst(shiftMonths(due, -1, day)).mv);

  const rows = schedule(loan.principal, loan.termMonths, rates, loan.method, {
    prepayments: [...grouped.values()].map((g) => ({ afterPeriod: g.afterPeriod, amount: g.amount, mode: g.mode })),
    ...(loan.fixedPayment !== undefined && { initialPayment: loan.fixedPayment }),
  });

  return rows.map((row, i) => {
    const dueDate = dueDates[i];
    if (dueDate === undefined) throw new Error(`no hay fecha de pago para la cuota ${i + 1}`);
    // Si un abono liquidó la deuda, esa fila ya no paga cuota ni seguro. El seguro por tasa se calcula sobre el
    // saldo con el que arranca el periodo (ya sin el abono de ese periodo), así que un abono también lo baja
    const fixedOrRate =
      loan.insuranceRate === undefined
        ? loan.insurance
        : roundCents(new Decimal(row.openingBalance).times(loan.insuranceRate));
    const insurance = row.payment > 0 ? fixedOrRate : 0;
    const paidOn = row.prepayment > 0 ? grouped.get(i)?.date : undefined;
    const external = Math.min(row.prepayment, grouped.get(i)?.externalAmount ?? 0);
    return {
      ...row,
      loanId: loan.id,
      dueDate,
      insurance,
      total: row.payment + insurance,
      ...(paidOn !== undefined && { prepaymentDate: paidOn }),
      ...(external > 0 && { externalPrepayment: external }),
    };
  });
}

/** Lo que se debe de capital en `on`: baja con cada abono y cada pago cuya fecha ya llegó. */
export function payoffAmount(loan: Loan, on: IsoDate, prepayments: readonly LoanPrepayment[] = []): Cents {
  let balance = loan.principal;
  for (const row of loanSchedule(loan, prepayments)) {
    if (row.prepaymentDate !== undefined && row.prepaymentDate <= on) balance = row.openingBalance;
    if (row.dueDate <= on) balance = row.closingBalance;
  }
  return balance;
}
