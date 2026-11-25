import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import type { CardPurchase, CreditCard } from '../src/cards';
import type { Loan } from '../src/loans';
import { type ConfirmedPayment, type FixedExpense, type RecurringIncome, project } from '../src/projection';
import { cardEvents, loanEvents } from '../src/debt-events';
import { statement } from '../src/statement';
import { planCard } from '../src/card-payments';

// Mismos datos que debt-events.test.ts: tarjeta con corte el 15 y pago el 5 del mes siguiente
const cardRates = new RateHistory();
cardRates.add('2025-12-01', rateFromMv('0.02'));
const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates: cardRates,
  minPaymentMethod: 'constant_capital',
  singleInstallmentInterestFree: true,
  firstPeriodInterest: 'full_month',
  creditLimit: pesos(5_000_000),
  handlingFee: pesos(30_000),
  insurance: 0,
};
const purchases: CardPurchase[] = [
  { id: 'A', cardId: 'card-1', date: '2026-01-20', amount: pesos(1_200_000), installments: 3 },
];

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

/** El mínimo del extracto que corta el 15 de marzo (vence el 5 de abril). */
const { rows } = planCard(card, purchases, []);
const MIN_MAR = statement(card, rows, '2026-03-15').minimum.total;

const cardPayments = (confirmed: ConfirmedPayment[], from = '2026-03-20', to = '2026-05-31') =>
  cardEvents(card, purchases, [], [], from, to, confirmed).filter((e) => e.kind === 'card_payment');

describe('cardEvents con pagos confirmados', () => {
  it('sin confirmaciones sale igual que antes, y ahora trae la fecha programada', () => {
    const events = cardPayments([]);
    expect(events.map((e) => e.date)).toEqual(['2026-04-05', '2026-05-05']);
    expect(events.map((e) => e.scheduledDate)).toEqual(['2026-03-15', '2026-04-15']);
    expect(events.every((e) => e.confirmed === undefined)).toBe(true);
  });

  it('caso Nu: pagado el 25-mar por el mínimo sale ese día y NO el 5-abr', () => {
    const events = cardPayments([{ scheduledDate: '2026-03-15', date: '2026-03-25', amount: MIN_MAR }]);
    const march = events.filter((e) => e.scheduledDate === '2026-03-15');
    expect(march).toHaveLength(1);
    expect(march[0]).toMatchObject({
      date: '2026-03-25',
      amount: -MIN_MAR,
      confirmed: true,
      cutDate: '2026-03-15',
    });
    expect(events.some((e) => e.date === '2026-04-05')).toBe(false);
    // El siguiente extracto sigue supuesto
    expect(events.find((e) => e.scheduledDate === '2026-04-15')?.confirmed).toBeUndefined();
  });

  it('confirmado antes del saldo: ya está dentro, no hay evento ni tampoco el supuesto', () => {
    const events = cardPayments([{ scheduledDate: '2026-03-15', date: '2026-03-18', amount: MIN_MAR }]);
    expect(events.filter((e) => e.scheduledDate === '2026-03-15')).toEqual([]);
  });

  it('un pago adelantado entra al rango aunque su vencimiento quede fuera', () => {
    // El vencimiento (5-abr) cae después de `to`, pero el pago real (25-mar) no
    const events = cardPayments([{ scheduledDate: '2026-03-15', date: '2026-03-25', amount: MIN_MAR }], '2026-03-20', '2026-03-31');
    expect(events.map((e) => e.date)).toEqual(['2026-03-25']);
  });

  it('menos del mínimo: el pago real y el faltante en la siguiente fecha límite', () => {
    const paid = MIN_MAR - pesos(50_000);
    const events = cardPayments([{ scheduledDate: '2026-03-15', date: '2026-03-25', amount: paid }]);
    expect(events.filter((e) => e.date <= '2026-04-30').map((e) => [e.date, e.amount])).toEqual([['2026-03-25', -paid]]);
    const pending = events.find((e) => e.label === 'Pendiente del corte 2026-03-15');
    expect(pending).toMatchObject({ date: '2026-05-05', kind: 'card_payment', amount: -pesos(50_000) });
    expect(pending?.scheduledDate).toBeUndefined();
  });

  it('pago externo: baja la deuda pero no hay evento de caja, ni supuesto ni faltante', () => {
    const events = cardPayments([
      { scheduledDate: '2026-03-15', date: '2026-03-25', amount: pesos(1), external: true },
    ]);
    expect(events.filter((e) => e.scheduledDate === '2026-03-15' || e.label.startsWith('Pendiente'))).toEqual([]);
  });

  it('del mismo día del saldo solo cuenta si se marcó afterBalance', () => {
    const base = { scheduledDate: '2026-03-15', date: '2026-03-20', amount: MIN_MAR };
    expect(cardPayments([base]).filter((e) => e.scheduledDate === '2026-03-15')).toEqual([]);
    const after = cardPayments([{ ...base, afterBalance: true }]).find((e) => e.scheduledDate === '2026-03-15');
    expect(after).toMatchObject({ date: '2026-03-20', afterBalance: true });
  });
});

describe('loanEvents con pagos confirmados', () => {
  const installments = (confirmed: ConfirmedPayment[], from = '2026-03-01', to = '2026-06-30') =>
    loanEvents(loan, [], from, to, confirmed).filter((e) => e.kind === 'loan_payment');

  it('sin confirmaciones sale igual que antes, con su fecha programada', () => {
    const events = installments([]);
    expect(events.map((e) => e.date)).toEqual(['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10']);
    expect(events.map((e) => e.scheduledDate)).toEqual(events.map((e) => e.date));
  });

  it('cuota pagada 3 días antes: sale ese día y no en su fecha', () => {
    const [march] = installments([]);
    const events = installments([
      { scheduledDate: '2026-04-10', date: '2026-04-07', amount: -(installments([])[1]?.amount ?? 0) },
    ]);
    expect(march?.date).toBe('2026-03-10');
    expect(events.map((e) => e.date)).toEqual(['2026-03-10', '2026-04-07', '2026-05-10', '2026-06-10']);
    expect(events[1]).toMatchObject({ confirmed: true, scheduledDate: '2026-04-10' });
  });

  it('cuota con faltante: el resto se suma a la cuota siguiente', () => {
    const due = -(installments([])[1]?.amount ?? 0);
    const events = installments([{ scheduledDate: '2026-04-10', date: '2026-04-10', amount: due - pesos(100_000) }]);
    const may = events.filter((e) => e.date === '2026-05-10');
    expect(may.map((e) => e.amount).sort()).toEqual([-due, -pesos(100_000)].sort());
    expect(may.find((e) => e.label.startsWith('Pendiente'))).toBeDefined();
  });

  it('pagada antes del saldo: ningún evento, ni el supuesto', () => {
    const exact = -(installments([])[0]?.amount ?? 0);
    const events = installments([{ scheduledDate: '2026-03-10', date: '2026-03-05', amount: exact }], '2026-03-08');
    expect(events.map((e) => e.date)).toEqual(['2026-04-10', '2026-05-10', '2026-06-10']);
  });
});

describe('ingresos y gastos fijos confirmados', () => {
  const salary = (confirmed: ConfirmedPayment[]): RecurringIncome => ({
    id: 'salario',
    name: 'Salario',
    amount: pesos(3_000_000),
    day: 15,
    start: '2026-01-01',
    confirmed,
  });
  const run = (incomes: RecurringIncome[], fixedExpenses: FixedExpense[] = []) =>
    project(
      {
        asOf: '2026-03-01',
        openingBalance: 0,
        recurringIncomes: incomes,
        fixedExpenses,
        yellowBelowIncomePct: new Decimal('0.1'),
      },
      1,
    );

  it('sin confirmar, el evento trae su fecha programada y nada más cambia', () => {
    const [march] = run([salary([])]);
    expect(march?.events).toEqual([
      {
        date: '2026-03-15',
        kind: 'income',
        amount: pesos(3_000_000),
        label: 'Salario',
        refId: 'salario',
        scheduledDate: '2026-03-15',
      },
    ]);
  });

  it('confirmado con otra fecha y otro monto: el real reemplaza al supuesto', () => {
    const [march] = run([salary([{ scheduledDate: '2026-03-15', date: '2026-03-13', amount: pesos(2_800_000) }])]);
    expect(march?.events).toHaveLength(1);
    expect(march?.events[0]).toMatchObject({
      date: '2026-03-13',
      amount: pesos(2_800_000),
      scheduledDate: '2026-03-15',
      confirmed: true,
    });
    // El ingreso de referencia usa el monto real
    expect(march?.referenceIncome).toBe(pesos(2_800_000));
  });

  it('un gasto fijo confirmado sale con el monto real y en negativo', () => {
    const rent: FixedExpense = {
      id: 'arriendo',
      name: 'Arriendo',
      amount: pesos(1_000_000),
      day: 5,
      start: '2026-01-01',
      confirmed: [{ scheduledDate: '2026-03-05', date: '2026-03-07', amount: pesos(1_050_000) }],
    };
    const [march] = run([], [rent]);
    expect(march?.events[0]).toMatchObject({ date: '2026-03-07', amount: -pesos(1_050_000), confirmed: true });
  });

  it('con dos fechas en el mes, confirmar una deja la otra supuesta', () => {
    const [march] = run([
      {
        ...salary([{ scheduledDate: '2026-03-15', date: '2026-03-14', amount: pesos(1_400_000) }]),
        day: 15,
      },
      { ...salary([]), id: 'segunda', day: 30 },
    ]);
    const [first, second] = march!.events;
    expect(first).toMatchObject({ date: '2026-03-14', amount: pesos(1_400_000), confirmed: true });
    expect(second).toMatchObject({ date: '2026-03-30', amount: pesos(3_000_000) });
    expect(second?.confirmed).toBeUndefined();
  });
});
