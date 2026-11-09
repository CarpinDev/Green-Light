import Decimal from 'decimal.js';
import { type Cents, roundCents } from './money';

export type AmortizationMethod = 'constant_capital' | 'fixed_installment';

export interface ScheduleRow {
  period: number;          // 1..n
  openingBalance: Cents;
  interest: Cents;
  capital: Cents;
  payment: Cents;
  closingBalance: Cents;
}

export interface ScheduleOptions {
  /** Tasa que solo se usa para cobrar el interés de la cuota 1. No altera el capital. */
  firstPeriodRate?: Decimal;
}

export function fixedPayment(principal: Cents, rate: Decimal, n: number): Cents {
  assertInstallments(n);
  assertRate(rate);

  const p = new Decimal(principal);
  const payment = rate.isZero()
    ? p.div(n)
    : p.times(rate).div(new Decimal(1).minus(rate.plus(1).pow(-n)));

  return roundCents(payment);
}

export function schedule(
  principal: Cents,
  n: number,
  rates: readonly Decimal[],
  method: AmortizationMethod,
  options: ScheduleOptions = {},
): ScheduleRow[] {
  assertPrincipal(principal);
  assertInstallments(n);
  if (rates.length === 0) throw new RangeError('rates no puede estar vacía');
  rates.forEach(assertRate);
  if (options.firstPeriodRate !== undefined) assertRate(options.firstPeriodRate);

  // Si hay menos tasas que cuotas, se repite la última
  const rateAt = (i: number): Decimal => rates[Math.min(i, rates.length - 1)]!;
  const baseCapital = Math.floor(principal / n);

  const rows: ScheduleRow[] = [];
  let balance: number = principal;
  let payment = 0;
  let paymentRate: Decimal | undefined;

  for (let i = 0; i < n; i++) {
    const rate = rateAt(i);
    const isLast = i === n - 1;
    const contractualInterest = roundCents(new Decimal(balance).times(rate));

    let capital: number;
    if (method === 'constant_capital') {
      // La última cuota absorbe los centavos que no se pudieron repartir
      capital = isLast ? balance : baseCapital;
    } else {
      // La cuota se recalcula sobre el saldo y las cuotas restantes solo si cambia la tasa
      if (paymentRate === undefined || !rate.equals(paymentRate)) {
        payment = fixedPayment(balance as Cents, rate, n - i);
        paymentRate = rate;
      }
      // La última cuota liquida el saldo y absorbe el redondeo acumulado
      capital = isLast ? balance : Math.min(balance, payment - contractualInterest);
    }

    const interest =
      i === 0 && options.firstPeriodRate !== undefined
        ? roundCents(new Decimal(balance).times(options.firstPeriodRate))
        : contractualInterest;

    const closing = balance - capital;
    rows.push({
      period: i + 1,
      openingBalance: balance as Cents,
      interest,
      capital: capital as Cents,
      payment: (capital + interest) as Cents,
      closingBalance: closing as Cents,
    });
    balance = closing;
  }

  return rows;
}

function assertPrincipal(principal: number): void {
  if (!Number.isSafeInteger(principal) || principal <= 0) {
    throw new RangeError(`principal debe ser un entero de centavos > 0, llegó ${principal}`);
  }
}

function assertInstallments(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`n debe ser un entero >= 1, llegó ${n}`);
  }
}

function assertRate(rate: Decimal): void {
  if (!rate.isFinite() || rate.isNegative()) {
    throw new RangeError(`tasa inválida: ${rate.toString()}`);
  }
}