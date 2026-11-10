import Decimal from 'decimal.js';
import { type Cents, roundCents } from './money';
import { assertInstallments, assertPrincipal, assertRate, fixedPayment } from './amortization';

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

    // Tramo sobre el que se reparte el capital en abono constante.
    // Se reinicia cuando un abono reduce la cuota.
    let segment = { start: 0, principal, count: n };

    const rows: ScheduleRow[] = [];
    let balance = principal;
    let payment = 0;
    let paymentRate: Decimal | undefined;

    for (let i = 0; i < n && (i === 0 || balance > 0); i++) {
        const rate = rates[Math.min(i, rates.length - 1)];
        if (rate === undefined) {
            throw new Error(`no hay tasa para el periodo ${i + 1}`);
        }

        // 1. Cuota fija vigente, calculada sobre el saldo ANTES del abono.
        //    Así un abono que reduce plazo nunca baja la cuota, ni siquiera en la cuota 1.
        if (method === 'fixed_installment' && (paymentRate === undefined || !rate.equals(paymentRate))) {
            payment = fixedPayment(balance, rate, n - i);
            paymentRate = rate;
        }

        // 2. Abono del periodo
        const pre = prepayments.get(i);
        const prepayment = pre ? Math.min(pre.amount, balance) : 0;
        balance -= prepayment;

        if (pre?.mode === 'reduce_payment' && balance > 0) {
            segment = { start: i, principal: balance, count: n - i };
            if (method === 'fixed_installment') payment = fixedPayment(balance, rate, n - i);
        }

        // 2. Capital de la cuota
        const isLast = i === n - 1;
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