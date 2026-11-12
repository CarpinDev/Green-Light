import { describe, expect, it } from 'vitest';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import type { CapitalPayment, CardPurchase, CreditCard } from '../src/cards';
import { planCard } from '../src/card-payments';
import { type Loan, type LoanPrepayment, loanSchedule } from '../src/loans';
import { cardEvents, loanEvents } from '../src/debt-events';

// Un abono externo (dinero que no pasa por las cuentas) baja la deuda igual que cualquier otro, pero no sale del
// disponible: el plan y los intereses no cambian, solo la salida de caja. Datos ficticios.

const rates = new RateHistory();
rates.add('2025-12-01', rateFromMv('0.02'));
const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates,
  minPaymentMethod: 'constant_capital',
  singleInstallmentInterestFree: true,
  firstPeriodInterest: 'full_month',
  creditLimit: pesos(5_000_000),
  handlingFee: 0,
  insurance: 0,
};
// 1.200.000 a 3 cuotas: cortes feb 15, mar 15 y abr 15
const purchases: CardPurchase[] = [
  { id: 'A', cardId: 'card-1', date: '2026-01-20', amount: pesos(1_200_000), installments: 3 },
];
const abono = (id: string, date: string, amount: number, external = false): CapitalPayment => ({
  id,
  cardId: 'card-1',
  date,
  amount: pesos(amount),
  mode: 'reduce_term',
  ...(external && { external }),
});

const capitalEvents = (payments: CapitalPayment[]) =>
  cardEvents(card, purchases, payments, [], '2026-03-10', '2026-06-30').filter((e) => e.kind === 'capital_payment');
/** Las filas sin el dato de lo externo: lo demás debe ser idéntico. */
const withoutExternal = (payments: CapitalPayment[]) =>
  planCard(card, purchases, payments).rows.map(({ externalPrepayment: _external, ...row }) => row);

describe('abono externo a una tarjeta', () => {
  it('deja el plan y los intereses idénticos a uno no externo, pero la salida de caja es 0', () => {
    const normal = [abono('a1', '2026-03-25', 200_000)];
    const external = [abono('a1', '2026-03-25', 200_000, true)];

    expect(withoutExternal(external)).toEqual(withoutExternal(normal));
    expect(capitalEvents(normal)).toHaveLength(1);
    expect(capitalEvents(external)).toEqual([]);
  });

  it('el pago mínimo de los extractos es el mismo con o sin lo externo', () => {
    const minimums = (payments: CapitalPayment[]) =>
      cardEvents(card, purchases, payments, [], '2026-03-10', '2026-06-30')
        .filter((e) => e.kind === 'card_payment')
        .map((e) => [e.date, e.amount]);
    expect(minimums([abono('a1', '2026-03-25', 200_000, true)])).toEqual(
      minimums([abono('a1', '2026-03-25', 200_000)]),
    );
  });

  it('uno mixto en el mismo periodo suma solo lo que no es externo', () => {
    const mixed = [abono('a1', '2026-03-20', 100_000, true), abono('a2', '2026-03-25', 200_000)];
    const events = capitalEvents(mixed);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: '2026-03-25', amount: -pesos(200_000) });
    // El plan baja por los 300.000, como si ninguno fuera externo
    expect(withoutExternal(mixed)).toEqual(
      withoutExternal(mixed.map((p) => ({ ...p, external: false }))),
    );
  });

  it('en periodos distintos, cada uno con lo suyo', () => {
    const events = capitalEvents([abono('a1', '2026-03-20', 100_000, true), abono('a2', '2026-04-20', 50_000)]);
    // El de abril cae después del último corte con deuda por facturar: solo puede caber si queda algo; aquí sí
    expect(events.every((e) => e.amount !== -pesos(100_000))).toBe(true);
  });

  it('un externo que no se pudo aplicar no genera ningún evento (no inventa plata)', () => {
    // Más que toda la deuda abonable: lo que sobra queda `unapplied`
    const huge = [abono('a1', '2026-03-25', 5_000_000, true)];
    const { unapplied } = planCard(card, purchases, huge);

    expect(unapplied.length).toBeGreaterThan(0);
    expect(capitalEvents(huge)).toEqual([]);
    // Y no cambia nada frente al mismo abono no externo
    expect(withoutExternal(huge)).toEqual(withoutExternal([abono('a1', '2026-03-25', 5_000_000)]));
  });

  it('uno no externo que no cupo sigue sin generar evento por el sobrante', () => {
    const events = capitalEvents([abono('a1', '2026-03-25', 5_000_000)]);
    const total = events.reduce((sum, e) => sum + e.amount, 0);
    // Solo sale lo que se aplicó (el capital que faltaba por facturar), no los 5.000.000
    expect(-total).toBeLessThan(pesos(1_200_000));
  });
});

describe('abono externo a un préstamo', () => {
  const loanRates = new RateHistory();
  loanRates.add('2026-01-01', rateFromMv('0.015'));
  const loan: Loan = {
    id: 'loan-1',
    principal: pesos(10_000_000),
    termMonths: 12,
    firstPaymentDate: '2026-02-10',
    rates: loanRates,
    method: 'fixed_installment',
    insurance: pesos(12_000),
  };
  const prepay = (id: string, date: string, amount: number, external = false): LoanPrepayment => ({
    id,
    loanId: 'loan-1',
    date,
    amount: pesos(amount),
    mode: 'reduce_term',
    ...(external && { external }),
  });
  const capital = (list: LoanPrepayment[]) =>
    loanEvents(loan, list, '2026-03-10', '2026-12-31').filter((e) => e.kind === 'capital_payment');
  const rowsOf = (list: LoanPrepayment[]) =>
    loanSchedule(loan, list).map(({ externalPrepayment: _external, ...row }) => row);

  it('el cronograma es idéntico y no sale plata', () => {
    const normal = [prepay('p1', '2026-04-15', 2_000_000)];
    const external = [prepay('p1', '2026-04-15', 2_000_000, true)];

    expect(rowsOf(external)).toEqual(rowsOf(normal));
    expect(capital(normal)).toHaveLength(1);
    expect(capital(external)).toEqual([]);
  });

  it('mixto en el mismo periodo: sale solo lo no externo', () => {
    const events = capital([prepay('p1', '2026-04-12', 1_000_000, true), prepay('p2', '2026-04-15', 2_000_000)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ amount: -pesos(2_000_000) });
  });

  it('un abono externo más grande que la deuda no inventa plata', () => {
    const events = capital([prepay('p1', '2026-04-15', 50_000_000, true)]);
    expect(events).toEqual([]);
  });
});
