import { type Cents, type IsoDate, loanSchedule, payoffAmount } from '@greenlight/engine';
import { toEngineLoan, toLoanPrepayment } from '../projection/mappers';
import type { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { currentRateOf } from './cards.service';
import type { Loan } from './entities/loan.entity';
import type { ProductRate } from './entities/product-rate.entity';
import type { Product } from './entities/product.entity';

export interface LoanSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  /** La tasa vigente hoy; null si ninguna rige todavía. Texto exacto, como en las tarjetas. */
  rate: { ea: string; mv: string } | null;
  /** La próxima cuota completa (capital + interés + seguro). 0 si ya no quedan. */
  installmentCents: Cents;
  /** El seguro de la próxima cuota (con seguro por tasa baja cada mes). */
  insuranceCents: Cents;
  /** Capital que se debe hoy. */
  balanceCents: Cents;
  /** La fecha de la próxima cuota; null si ya no quedan. */
  nextDueDate: IsoDate | null;
  remainingInstallments: number;
  /** La fecha de la última cuota. */
  endDate: IsoDate | null;
}

export interface LoanScheduleRow {
  period: number;
  dueDate: IsoDate;
  payment: Cents;
  interest: Cents;
  principal: Cents;
  insurance: Cents;
  total: Cents;
  closingBalance: Cents;
  prepayment: Cents;
  /** La fecha de pago ya llegó (`dueDate <= hoy`): se da por pagada. */
  paid: boolean;
}

/** Los datos con que se creó o se editó el préstamo, para llenar el formulario de edición. */
export interface LoanTerms {
  principalCents: Cents;
  termMonths: number;
  firstPaymentDate: IsoDate;
  /** La cuota del banco sin seguro; null si la calcula el motor. */
  fixedPaymentCents: Cents | null;
  /** Seguro fijo mensual (0 si el seguro es por porcentaje). */
  insuranceCents: Cents;
  /** Seguro como porcentaje mensual del saldo ("0.2344"); null si es fijo. */
  insuranceRatePct: string | null;
}

export interface LoanDetail extends LoanSummary {
  terms: LoanTerms;
  schedule: LoanScheduleRow[];
}

export interface LoanFacts {
  product: Product;
  loan: Loan;
  rates: readonly ProductRate[];
  /** Los abonos de este préstamo. */
  payments: readonly CapitalPayment[];
}

/**
 * Todo lo que la app muestra de un préstamo, calculado con `loanSchedule` y `payoffAmount` del motor a partir de
 * los datos y los abonos: nada se guarda calculado. Pura, sin base de datos.
 */
export function buildLoanDetail(facts: LoanFacts, today: IsoDate): LoanDetail {
  const { product, loan } = facts;
  const engineLoan = toEngineLoan(loan, facts.rates);
  const prepayments = facts.payments.map(toLoanPrepayment);
  const rows = loanSchedule(engineLoan, prepayments);

  // Una fila sin pago (liquidada por un abono) ya no es una cuota que quede
  const pending = rows.filter((r) => r.dueDate > today && r.payment > 0);
  const next = pending[0];
  const last = [...rows].reverse().find((r) => r.payment > 0);

  return {
    id: product.id,
    name: product.name,
    bank: product.bank,
    last4: product.last4,
    rate: rateOn(facts.rates, today),
    installmentCents: next?.total ?? 0,
    insuranceCents: next?.insurance ?? 0,
    balanceCents: payoffAmount(engineLoan, today, prepayments),
    nextDueDate: next?.dueDate ?? null,
    remainingInstallments: pending.length,
    endDate: last?.dueDate ?? null,
    terms: {
      principalCents: loan.principalCents,
      termMonths: loan.termMonths,
      firstPaymentDate: loan.firstPaymentDate,
      fixedPaymentCents: loan.fixedPaymentCents,
      insuranceCents: loan.insuranceCents,
      insuranceRatePct: loan.insuranceRate == null ? null : loan.insuranceRate.times(100).toFixed(),
    },
    schedule: rows.map((r) => ({
      period: r.period,
      dueDate: r.dueDate,
      payment: r.payment,
      interest: r.interest,
      principal: r.capital,
      insurance: r.insurance,
      total: r.total,
      closingBalance: r.closingBalance,
      prepayment: r.prepayment,
      paid: r.dueDate <= today,
    })),
  };
}

/** El resumen de un préstamo (lo mismo sin los detalles del cronograma). */
export function buildLoanSummary(facts: LoanFacts, today: IsoDate): LoanSummary {
  const detail = buildLoanDetail(facts, today);
  return {
    id: detail.id,
    name: detail.name,
    bank: detail.bank,
    last4: detail.last4,
    rate: detail.rate,
    installmentCents: detail.installmentCents,
    insuranceCents: detail.insuranceCents,
    balanceCents: detail.balanceCents,
    nextDueDate: detail.nextDueDate,
    remainingInstallments: detail.remainingInstallments,
    endDate: detail.endDate,
  };
}

function rateOn(rates: readonly ProductRate[], today: IsoDate): LoanSummary['rate'] {
  const current = currentRateOf(rates, today);
  return current === null ? null : { ea: current.ea, mv: current.mv };
}
