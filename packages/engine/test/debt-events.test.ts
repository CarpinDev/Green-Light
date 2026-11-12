import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import type { CapitalPayment, CardPurchase, CreditCard } from '../src/cards';
import type { Loan } from '../src/loans';
import { type FixedExpense, project } from '../src/projection';
import { cardEvents, fixedExpensesAsPurchases, loanEvents } from '../src/debt-events';

// Tarjeta ficticia: corte el 15, pago el 5, 2 % M.V., cuota de manejo 30.000
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

// Compra A: 1.200.000 a 3 cuotas (cortes feb 15, mar 15, abr 15)
const purchases: CardPurchase[] = [
  { id: 'A', cardId: 'card-1', date: '2026-01-20', amount: pesos(1_200_000), installments: 3 },
];
// Netflix el 20 de cada mes con la tarjeta: cada cargo es una compra a 1 cuota
const fixed: FixedExpense[] = [
  { id: 'netflix', name: 'Netflix', amount: pesos(40_000), day: 20, start: '2026-01-01', cardId: 'card-1' },
];
const abono: CapitalPayment = {
  id: 'ab-1',
  cardId: 'card-1',
  date: '2026-03-25',
  amount: pesos(200_000),
  mode: 'reduce_term',
};

// Préstamo de loans.test.ts: cuota 916.799,93 + seguro 12.000 = 928.799,93
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

describe('fixedExpensesAsPurchases', () => {
  it('cada cargo mensual de la tarjeta es una compra a 1 cuota con id único', () => {
    const list = fixedExpensesAsPurchases(card, fixed, '2026-03-10', '2026-04-30');
    expect(list.map((p) => p.id)).toEqual([
      'netflix@2026-01-20',
      'netflix@2026-02-20',
      'netflix@2026-03-20',
      'netflix@2026-04-20',
    ]);
    expect(list.every((p) => p.installments === 1 && p.amount === pesos(40_000))).toBe(true);
  });

  it('arranca 2 meses antes: un cargo viejo puede tener su extracto aún por pagar', () => {
    const list = fixedExpensesAsPurchases(card, fixed, '2026-03-10', '2026-03-31');
    expect(list[0]?.date).toBe('2026-01-20');
  });

  it('ignora gastos fijos de otra tarjeta o sin tarjeta', () => {
    const others: FixedExpense[] = [
      { ...fixed[0]!, id: 'x', cardId: 'card-2' },
      { ...fixed[0]!, id: 'y', cardId: undefined },
    ];
    expect(fixedExpensesAsPurchases(card, others, '2026-03-10', '2026-04-30')).toEqual([]);
  });
});

describe('cardEvents', () => {
  const events = cardEvents(card, purchases, [abono], fixed, '2026-03-10', '2026-05-31');
  const payments = events.filter((e) => e.kind === 'card_payment');

  it('un pago mínimo por cada extracto que vence en (desde, hasta]', () => {
    expect(payments.map((e) => e.date)).toEqual(['2026-04-05', '2026-05-05']);
  });

  it('mínimo de abril = cuota A2 + interés + Netflix de febrero + manejo', () => {
    // 400.000 + 16.000 + 40.000 + 30.000
    expect(payments[0]?.amount).toBe(-pesos(486_000));
  });

  it('el abono de marzo baja el mínimo de mayo', () => {
    // A3 queda en 200.000 + 4.000 de interés + Netflix de marzo + manejo
    expect(payments[1]?.amount).toBe(-pesos(274_000));
  });

  it('el abono sale del disponible el día que se hace', () => {
    const capital = events.filter((e) => e.kind === 'capital_payment');
    expect(capital).toHaveLength(1);
    expect(capital[0]?.date).toBe('2026-03-25');
    expect(capital[0]?.amount).toBe(-pesos(200_000));
  });

  it('incluye un extracto cortado antes de `desde` si vence después', () => {
    const early = cardEvents(card, purchases, [], fixed, '2026-03-01', '2026-03-31');
    // Corte de febrero, vence el 5 de marzo: 400.000 + 24.000 + Netflix de enero + manejo
    expect(early.map((e) => [e.date, e.amount])).toEqual([['2026-03-05', -pesos(494_000)]]);
  });

  it('todos los montos son salidas (negativos)', () => {
    expect(events.every((e) => e.amount < 0)).toBe(true);
  });

  it('un pago de tarjeta trae el corte que paga y el pago total, sin tener que leer el texto', () => {
    // El extracto que vence el 5 de abril es el que cortó el 15 de marzo
    expect(payments.map((e) => e.cutDate)).toEqual(['2026-03-15', '2026-04-15']);
    for (const p of payments) {
      expect(p.label).toContain(p.cutDate);
      expect(p.fullPayment).toBeGreaterThanOrEqual(-p.amount);
    }
    // El pago total es positivo: la A3 pendiente (200.000) y las demás cuotas por facturar más lo del corte
    expect(payments[0]?.fullPayment).toBeGreaterThan(0);
  });

  it('los demás eventos no traen esos campos', () => {
    const others = events.filter((e) => e.kind !== 'card_payment');
    expect(others.length).toBeGreaterThan(0);
    for (const e of others) {
      expect('cutDate' in e).toBe(false);
      expect('fullPayment' in e).toBe(false);
    }
    for (const e of loanEvents(loan, [], '2026-03-10', '2026-05-31')) {
      expect('cutDate' in e || 'fullPayment' in e).toBe(false);
    }
  });
});

describe('loanEvents', () => {
  it('una cuota (con seguro) por cada fecha de pago en (desde, hasta]', () => {
    const events = loanEvents(loan, [], '2026-03-10', '2026-05-31');
    expect(events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ['2026-04-10', 'loan_payment', -92_879_993],
      ['2026-05-10', 'loan_payment', -92_879_993],
    ]);
  });

  it('el abono al préstamo sale el día que se hace', () => {
    const events = loanEvents(
      loan,
      [{ id: 'pp', loanId: 'loan-1', date: '2026-04-15', amount: pesos(2_000_000), mode: 'reduce_term' }],
      '2026-03-10',
      '2026-05-31',
    );
    expect(events.find((e) => e.kind === 'capital_payment')).toMatchObject({
      date: '2026-04-15',
      amount: -pesos(2_000_000),
    });
  });
});

describe('proyección completa con deudas', () => {
  // Hoy 10 de marzo, 2.000.000 en la cuenta y salario de 3.000.000 el 30
  const [mar, apr, may] = project(
    {
      asOf: '2026-03-10',
      openingBalance: pesos(2_000_000),
      recurringIncomes: [{ id: 'salary', name: 'Salario', amount: pesos(3_000_000), day: 30, start: '2026-01-01' }],
      fixedExpenses: fixed,
      extraEvents: [
        ...cardEvents(card, purchases, [abono], fixed, '2026-03-10', '2026-05-31'),
        ...loanEvents(loan, [], '2026-03-10', '2026-05-31'),
      ],
      yellowBelowIncomePct: new Decimal('0.10'),
    },
    3,
  );

  it('marzo: el abono baja el saldo a 1.800.000 y cierra en 4.800.000', () => {
    expect(mar?.lowestBalance).toBe(pesos(1_800_000));
    expect(mar?.lowestBalanceDate).toBe('2026-03-25');
    expect(mar?.closingBalance).toBe(pesos(4_800_000));
  });

  it('abril: mínimo de la tarjeta y cuota del préstamo antes del salario', () => {
    expect(apr?.lowestBalance).toBe(338_520_007);
    expect(apr?.lowestBalanceDate).toBe('2026-04-10');
    expect(apr?.closingBalance).toBe(638_520_007);
  });

  it('Netflix con tarjeta no aparece como gasto fijo aparte: ya viene dentro del pago de la tarjeta', () => {
    const all = [mar, apr, may].flatMap((m) => m?.events ?? []);
    expect(all.some((e) => e.kind === 'fixed_expense')).toBe(false);
    expect(all.filter((e) => e.kind === 'card_payment').every((e) => e.cutDate !== undefined)).toBe(true);
  });

  it('mayo cierra en verde', () => {
    expect(may?.closingBalance).toBe(818_240_014);
    expect(may?.light).toBe('green');
  });
});
