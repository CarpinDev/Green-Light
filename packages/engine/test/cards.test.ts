import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, eaToPeriod, rateFromMv } from '../src/rates';
import { daysBetween } from '../src/calendar';
import { type CardPurchase, type CreditCard, planPurchase, purchaseCuts, purchaseRate } from '../src/cards';

// Tarjeta ficticia: corte el 15, pago el 5. Tasa 2 % M.V. desde enero y 2,5 % M.V. desde marzo
const history = new RateHistory();
history.add('2026-01-01', rateFromMv('0.02'));
history.add('2026-03-01', rateFromMv('0.025'));

const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates: history,
  minPaymentMethod: 'constant_capital',
  singleInstallmentInterestFree: true,
  firstPeriodInterest: 'full_month',
};

const purchase = (overrides: Partial<CardPurchase> = {}): CardPurchase => ({
  id: 'p-1',
  cardId: 'card-1',
  date: '2026-01-20',
  amount: pesos(1_200_000),
  installments: 3,
  ...overrides,
});

describe('helpers nuevos', () => {
  describe('daysBetween (calendar)', () => {
    it('cuenta los días entre dos fechas', () => {
      expect(daysBetween('2026-01-20', '2026-02-15')).toBe(26);
      expect(daysBetween('2026-02-15', '2026-02-15')).toBe(0);
    });

    it('cruza años y respeta los bisiestos', () => {
      expect(daysBetween('2027-12-20', '2028-03-01')).toBe(72);
    });
  });

  describe('eaToPeriod (rates)', () => {
    it('365 días equivalen a la E.A.', () => {
      expect(eaToPeriod(new Decimal('0.3'), 365).toString()).toBe('0.3');
    });

    it('30 días al 30 % E.A. da 0,021798373506', () => {
      expect(eaToPeriod(new Decimal('0.3'), 30).toString()).toBe('0.021798373506');
    });

    it('0 días es tasa 0 y días negativos se rechazan', () => {
      expect(eaToPeriod(new Decimal('0.3'), 0).isZero()).toBe(true);
      expect(() => eaToPeriod(new Decimal('0.3'), -1)).toThrow(RangeError);
    });
  });
});

describe('cards: plan de una compra', () => {
  describe('purchaseCuts: en qué cortes se factura', () => {
    it('una compra después del corte entra al corte del mes siguiente', () => {
      expect(purchaseCuts(card, purchase())).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
    });

    it('una compra el mismo día del corte entra en ese corte', () => {
      expect(purchaseCuts(card, purchase({ date: '2026-01-15', installments: 1 }))).toEqual(['2026-01-15']);
    });

    it('con corte el 31 usa el último día en los meses cortos', () => {
      const card31 = { ...card, cutDay: 31 };
      expect(purchaseCuts(card31, purchase({ date: '2026-01-31' }))).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
      ]);
    });
  });

  describe('purchaseRate: qué tasa paga cada cuota', () => {
    it('usa la tasa de la tarjeta vigente en la fecha de corte', () => {
      expect(purchaseRate(card, purchase(), '2026-02-15').mv.toString()).toBe('0.02');
      expect(purchaseRate(card, purchase(), '2026-03-15').mv.toString()).toBe('0.025');
    });

    it('1 cuota con la tarjeta configurada sin interés: tasa 0', () => {
      expect(purchaseRate(card, purchase({ installments: 1 }), '2026-02-15').mv.isZero()).toBe(true);
    });

    it('1 cuota con la bandera apagada: tasa de la tarjeta', () => {
      const charging = { ...card, singleInstallmentInterestFree: false };
      expect(purchaseRate(charging, purchase({ installments: 1 }), '2026-02-15').mv.toString()).toBe('0.02');
    });

    it('la promoción de la compra gana sobre la tasa de la tarjeta', () => {
      const promo = purchase({ promoRate: rateFromMv('0.015') });
      expect(purchaseRate(card, promo, '2026-03-15').mv.toString()).toBe('0.015');
    });
  });

  describe('planPurchase: tabla con fechas', () => {
    const rows = planPurchase(card, purchase());

    it('cada cuota trae su corte y su fecha límite de pago', () => {
      expect(rows.map((r) => [r.cutDate, r.dueDate])).toEqual([
        ['2026-02-15', '2026-03-05'],
        ['2026-03-15', '2026-04-05'],
        ['2026-04-15', '2026-05-05'],
      ]);
      expect(rows.every((r) => r.purchaseId === 'p-1')).toBe(true);
    });

    it('abono constante de 400.000 con la tasa vigente en cada corte', () => {
      expect(rows.map((r) => r.capital)).toEqual([pesos(400_000), pesos(400_000), pesos(400_000)]);
      // Feb al 2 % sobre 1.200.000; marzo y abril al 2,5 %
      expect(rows.map((r) => r.interest)).toEqual([pesos(24_000), pesos(20_000), pesos(10_000)]);
    });

    it('usa el método de mínimo de la tarjeta (cuota fija)', () => {
      const fixed = planPurchase(
        { ...card, minPaymentMethod: 'fixed_installment' },
        purchase({ date: '2026-03-10', installments: 2 }),
      );
      expect(fixed[0]?.payment).toBe(62_259_259);
      expect(fixed[1]?.closingBalance).toBe(0);
    });
  });

  describe('interés de la primera cuota', () => {
    it('full_month: mes completo', () => {
      expect(planPurchase(card, purchase())[0]?.interest).toBe(pesos(24_000));
    });

    it('prorated: solo los 26 días entre la compra y el corte', () => {
      const prorated = { ...card, firstPeriodInterest: 'prorated' as const };
      expect(planPurchase(prorated, purchase())[0]?.interest).toBe(2_048_550);
    });

    it('none: la primera cuota no paga interés', () => {
      const none = { ...card, firstPeriodInterest: 'none' as const };
      const plan = planPurchase(none, purchase());
      expect(plan[0]?.interest).toBe(0);
      expect(plan[1]?.interest).toBe(pesos(20_000));
    });

    it('1 cuota sin interés no cobra ni siquiera el prorrateo', () => {
      const prorated = { ...card, firstPeriodInterest: 'prorated' as const };
      const plan = planPurchase(prorated, purchase({ installments: 1 }));
      expect(plan[0]?.interest).toBe(0);
      expect(plan[0]?.payment).toBe(pesos(1_200_000));
    });
  });

  describe('promociones', () => {
    it('0 % a 12 cuotas: ningún interés aunque la tarjeta cambie de tasa', () => {
      const plan = planPurchase(card, purchase({ installments: 12, promoRate: rateFromMv('0') }));
      expect(plan).toHaveLength(12);
      expect(plan.every((r) => r.interest === 0)).toBe(true);
      expect(plan[0]?.payment).toBe(pesos(100_000));
    });

    it('la tasa de la promoción se mantiene toda la vida de la compra', () => {
      const plan = planPurchase(card, purchase({ promoRate: rateFromMv('0.01') }));
      expect(plan.map((r) => r.interest)).toEqual([pesos(12_000), pesos(8_000), pesos(4_000)]);
    });
  });

  describe('validaciones', () => {
    it('rechaza una compra de otra tarjeta', () => {
      expect(() => planPurchase(card, purchase({ cardId: 'otra' }))).toThrow();
    });

    it('rechaza cuotas fuera de 1..72', () => {
      expect(() => planPurchase(card, purchase({ installments: 0 }))).toThrow(RangeError);
      expect(() => planPurchase(card, purchase({ installments: 73 }))).toThrow(RangeError);
    });

    it('falla si no hay tasa vigente en la fecha del corte', () => {
      expect(() => planPurchase(card, purchase({ date: '2025-11-01' }))).toThrow();
    });
  });
});
