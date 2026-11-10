import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import type { CardPurchase, CreditCard } from '../src/cards';
import type { ProjectionInput } from '../src/projection';
import { compareInstallments, simulatePurchase } from '../src/simulator';

// Tarjeta ficticia: corte el 15, pago el 5, 2 % M.V., cupo 3.000.000, sin cargos
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
  creditLimit: pesos(3_000_000),
  handlingFee: 0,
  insurance: 0,
};

// Ya debo A: 1.200.000 a 3 cuotas
const A: CardPurchase = { id: 'A', cardId: 'card-1', date: '2026-02-20', amount: pesos(1_200_000), installments: 3 };
// Quiero comprar un televisor de 1.200.000 el 12 de marzo
const tv: CardPurchase = { id: 'tv', cardId: 'card-1', date: '2026-03-12', amount: pesos(1_200_000), installments: 3 };

// Hoy 10 de marzo, 500.000 en la cuenta, salario de 3.000.000 el 30 y arriendo de 2.000.000 el 1
const baseline: ProjectionInput = {
  asOf: '2026-03-10',
  openingBalance: pesos(500_000),
  recurringIncomes: [{ id: 'salary', name: 'Salario', amount: pesos(3_000_000), day: 30, start: '2026-01-01' }],
  fixedExpenses: [{ id: 'rent', name: 'Arriendo', amount: pesos(2_000_000), day: 1, start: '2026-01-01' }],
  yellowBelowIncomePct: new Decimal('0.10'),
};

const simulate = (overrides: Partial<CardPurchase> = {}) =>
  simulatePurchase({
    card,
    purchases: [A],
    payments: [],
    fixedExpenses: [],
    baseline,
    candidate: { ...tv, ...overrides },
    months: 3,
  });

describe('compareInstallments: 1, 3, 6 y 12 cuotas', () => {
  const options = compareInstallments(card, tv);

  it('devuelve una opción por plazo, en orden', () => {
    expect(options.map((o) => o.installments)).toEqual([1, 3, 6, 12]);
  });

  it('a 1 cuota no hay interés (tarjeta con 1 cuota sin interés)', () => {
    expect(options[0]).toEqual({
      installments: 1,
      firstPayment: pesos(1_200_000),
      totalInterest: 0,
      totalCost: pesos(1_200_000),
    });
  });

  it('a más cuotas, primera cuota menor pero más interés total', () => {
    expect(options.map((o) => o.firstPayment)).toEqual([
      pesos(1_200_000),
      pesos(424_000),
      pesos(224_000),
      pesos(124_000),
    ]);
    expect(options.map((o) => o.totalInterest)).toEqual([0, pesos(48_000), pesos(84_000), pesos(156_000)]);
    expect(options[3]?.totalCost).toBe(pesos(1_356_000));
  });

  it('con promoción al 0 % ningún plazo paga interés', () => {
    const promo = compareInstallments(card, { ...tv, promoRate: rateFromMv('0') });
    expect(promo.every((o) => o.totalInterest === 0)).toBe(true);
    expect(promo[3]?.firstPayment).toBe(pesos(100_000));
  });

  it('acepta otros plazos', () => {
    expect(compareInstallments(card, tv, [2, 24]).map((o) => o.installments)).toEqual([2, 24]);
  });
});

describe('simulatePurchase', () => {
  it('trae la tabla y el costo de la compra simulada', () => {
    const result = simulate();
    expect(result.rows).toHaveLength(3);
    expect(result.firstPayment).toBe(pesos(424_000));
    expect(result.totalInterest).toBe(pesos(48_000));
  });

  describe('cupo', () => {
    it('cupo disponible = cupo − lo que ya debo en la fecha de la compra', () => {
      expect(simulate().availableCredit).toBe(pesos(1_800_000));
      expect(simulate().exceedsLimit).toBe(false);
    });

    it('avisa si la compra no cabe en el cupo', () => {
      const result = simulate({ amount: pesos(2_000_000) });
      expect(result.exceedsLimit).toBe(true);
    });
  });

  describe('proyección con y sin la compra', () => {
    it('sin la compra, abril cierra en 4.076.000 y en verde', () => {
      const { without } = simulate();
      expect(without.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05']);
      expect(without[1]?.closingBalance).toBe(pesos(4_076_000));
      expect(without[1]?.light).toBe('green');
    });

    it('marzo no cambia: la primera cuota se paga el 5 de abril', () => {
      const result = simulate();
      expect(result.with[0]?.closingBalance).toBe(result.without[0]?.closingBalance);
    });

    it('a 3 cuotas abril baja en 424.000 y sigue verde', () => {
      const result = simulate();
      expect(result.with[1]?.closingBalance).toBe(pesos(3_652_000));
      expect(result.with[1]?.light).toBe('green');
    });

    it('a 1 cuota abril pasa por −124.000 antes del salario: amarillo', () => {
      const result = simulate({ installments: 1 });
      expect(result.with[1]?.lowestBalance).toBe(pesos(-124_000));
      expect(result.with[1]?.light).toBe('yellow');
    });

    it('no guarda nada: la compra no queda en la lista original', () => {
      const purchases = [A];
      simulatePurchase({ card, purchases, payments: [], fixedExpenses: [], baseline, candidate: tv, months: 3 });
      expect(purchases).toHaveLength(1);
    });
  });
});
