import Decimal from 'decimal.js';
import { type Cents, roundCents } from './money';

export type AmortizationMethod = 'constant_capital' | 'fixed_installment';
export type PrepaymentMode = 'reduce_payment' | 'reduce_term';

export interface Prepayment {
  /** Cuotas ya pagadas cuando se hace el abono (0..n−1). Se registra en la cuota afterPeriod + 1. */
  afterPeriod: number;
  amount: Cents;
  mode: PrepaymentMode;
}

export interface ScheduleRow {
  period: number;
  /** Saldo al inicio de la cuota, ya descontado el abono de este periodo. */
  openingBalance: Cents;
  prepayment: Cents;
  interest: Cents;
  capital: Cents;
  /** Capital + interés de la cuota; no incluye el abono. */
  payment: Cents;
  closingBalance: Cents;
}

export interface ScheduleOptions {
  /** Tasa que solo se usa para cobrar el interés de la cuota 1. No altera el capital. */
  firstPeriodRate?: Decimal;
  prepayments?: readonly Prepayment[];
  /** Cuota que informa el banco; reemplaza a la calculada. Solo con fixed_installment. */
  initialPayment?: Cents;
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

/**
 * Cuántas cuotas de valor `payment` hacen falta para pagar `balance` a la tasa `rate` (hacia arriba:
 * la última puede ser menor). Sale de despejar n en la fórmula de la cuota fija.
 */
export function periodsToPayOff(balance: Cents, rate: Decimal, payment: Cents): number {
  assertPrincipal(balance);
  assertRate(rate);
  if (!Number.isSafeInteger(payment) || payment <= 0) {
    throw new RangeError(`la cuota debe ser un entero de centavos > 0, llegó ${payment}`);
  }

  if (rate.isZero()) return Math.ceil(balance / payment);

  const interestShare = new Decimal(balance).times(rate).div(payment);
  if (interestShare.gte(1)) {
    throw new RangeError(`una cuota de ${payment} no alcanza a cubrir el interés de ${balance} al ${rate.toString()}`);
  }

  const n = new Decimal(1).minus(interestShare).ln().neg().div(rate.plus(1).ln());
  // La cuota viene redondeada al centavo: 12,0000001 cuotas son 12, no 13
  return n.toDecimalPlaces(6).ceil().toNumber();
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
  const prepayments = indexPrepayments(options.prepayments ?? [], n);
  if (options.initialPayment !== undefined) {
    if (method !== 'fixed_installment') {
      throw new RangeError('initialPayment solo aplica con cuota fija');
    }
    if (!Number.isSafeInteger(options.initialPayment) || options.initialPayment <= 0) {
      throw new RangeError(`initialPayment debe ser un entero de centavos > 0, llegó ${options.initialPayment}`);
    }
  }

  // Tramo sobre el que se reparte el capital en abono constante.
  // Se reinicia cuando un abono reduce la cuota.
  let segment = { start: 0, principal, count: n };

  const rows: ScheduleRow[] = [];
  let balance = principal;
  // Periodo en que debe terminar la deuda; un abono reduce_term en cuota fija lo recorta
  let termEnd = n;
  // La cuota fija nace del capital original; solo un abono reduce_payment la recalcula
  let payment = 0;
  let paymentRate: Decimal | undefined;
  if (method === 'fixed_installment') {
    const firstRate = rates[0];
    if (firstRate !== undefined) {
      payment = options.initialPayment ?? fixedPayment(principal, firstRate, n);
      paymentRate = firstRate;
    }
  }

  for (let i = 0; i < termEnd && (i === 0 || balance > 0); i++) {
    const rate = rates[Math.min(i, rates.length - 1)];
    if (rate === undefined) {
      throw new Error(`no hay tasa para el periodo ${i + 1}`);
    }

    // 1. Abono del periodo: se aplica antes de calcular la cuota
    const pre = prepayments.get(i);
    const prepayment = pre ? Math.min(pre.amount, balance) : 0;
    balance -= prepayment;

    if (pre && pre.mode === 'reduce_payment') {
      segment = { start: i, principal: balance, count: termEnd - i };
      paymentRate = undefined; // fuerza recálculo de la cuota fija
    } else if (pre && method === 'fixed_installment' && balance > 0) {
      // Se conserva la cuota vigente: el saldo nuevo se paga antes
      termEnd = Math.min(termEnd, i + periodsToPayOff(balance, rate, payment));
    }

    // 2. Capital de la cuota
    const isLast = i === termEnd - 1;
    const contractualInterest = roundCents(new Decimal(balance).times(rate));

    let capital: number;
    if (balance === 0) {
      capital = 0;
    } else if (method === 'constant_capital') {
      // El residuo se reparte de a 1 centavo; con reduce_term el tramo no cambia
      // y la cuota se recorta al saldo, así la deuda termina antes
      const k = i - segment.start + 1;
      const scheduled =
        Math.floor((segment.principal * k) / segment.count) -
        Math.floor((segment.principal * (k - 1)) / segment.count);
      capital = isLast ? balance : Math.min(balance, scheduled);
    } else {
      if (paymentRate === undefined || !rate.equals(paymentRate)) {
        payment = fixedPayment(balance, rate, termEnd - i);
        paymentRate = rate;
      }
      capital = isLast ? balance : Math.min(balance, Math.max(0, payment - contractualInterest));
    }

    const interest =
      i === 0 && options.firstPeriodRate !== undefined
        ? roundCents(new Decimal(balance).times(options.firstPeriodRate))
        : contractualInterest;

    const closing = balance - capital;
    rows.push({
      period: i + 1,
      openingBalance: balance,
      prepayment,
      interest,
      capital,
      payment: capital + interest,
      closingBalance: closing,
    });
    balance = closing;
  }

  return rows;
}

function indexPrepayments(list: readonly Prepayment[], n: number): Map<number, Prepayment> {
  const byPeriod = new Map<number, Prepayment>();
  for (const p of list) {
    if (!Number.isInteger(p.afterPeriod) || p.afterPeriod < 0 || p.afterPeriod > n - 1) {
      throw new RangeError(`afterPeriod debe ser un entero entre 0 y ${n - 1}, llegó ${p.afterPeriod}`);
    }
    if (!Number.isSafeInteger(p.amount) || p.amount <= 0) {
      throw new RangeError(`el abono debe ser un entero de centavos > 0, llegó ${p.amount}`);
    }
    if (p.mode !== 'reduce_payment' && p.mode !== 'reduce_term') {
      throw new RangeError(`modo de abono inválido: ${String(p.mode)}`);
    }
    if (byPeriod.has(p.afterPeriod)) {
      throw new RangeError(`ya hay un abono después de la cuota ${p.afterPeriod}`);
    }
    byPeriod.set(p.afterPeriod, p);
  }
  return byPeriod;
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
