import { describe, expect, it } from 'vitest';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { type CardPurchase, type CreditCard, planPurchase } from '../src/cards';
import { statement, usedCredit, utilization } from '../src/statement';

// Tarjeta ficticia: corte el 15, pago el 5, 2 % M.V., cupo 5.000.000,
// cuota de manejo 30.000 y seguro 5.000 por corte
const history = new RateHistory();
history.add('2026-01-01', rateFromMv('0.02'));

const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates: history,
  minPaymentMethod: 'constant_capital',
  singleInstallmentInterestFree: true,
  firstPeriodInterest: 'full_month',
  creditLimit: pesos(5_000_000),
  handlingFee: pesos(30_000),
  insurance: pesos(5_000),
};

const buy = (id: string, date: string, amount: number, installments: number): CardPurchase => ({
  id,
  cardId: 'card-1',
  date,
  amount: pesos(amount),
  installments,
});

// A: 3 cuotas de 400.000 (cortes feb, mar, abr)
// B: 1 cuota sin interés (corte feb)
// C: 2 cuotas de 300.000 (cortes mar, abr)
const purchases = [
  buy('A', '2026-01-20', 1_200_000, 3),
  buy('B', '2026-02-10', 300_000, 1),
  buy('C', '2026-02-20', 600_000, 2),
];
const rows = purchases.flatMap((p) => planPurchase(card, p));

describe('statement: extracto de un corte', () => {
  describe('corte de febrero (A1 + B)', () => {
    const feb = statement(card, rows, '2026-02-15');

    it('trae la fecha límite y solo las cuotas facturadas en ese corte', () => {
      expect(feb.dueDate).toBe('2026-03-05');
      expect(feb.lines.map((l) => l.purchaseId)).toEqual(['A', 'B']);
    });

    it('pago mínimo = capital de las cuotas + intereses + cargos', () => {
      expect(feb.minimum).toEqual({
        capital: pesos(700_000),
        interest: pesos(24_000),
        fees: pesos(35_000),
        total: pesos(759_000),
      });
    });

    it('pago total = todo el saldo de las compras facturadas + intereses + cargos', () => {
      expect(feb.fullPayment).toEqual({
        capital: pesos(1_500_000),
        interest: pesos(24_000),
        fees: pesos(35_000),
        total: pesos(1_559_000),
      });
    });
  });

  describe('corte de marzo (A2 + C1)', () => {
    const mar = statement(card, rows, '2026-03-15');

    it('mínimo de 763.000', () => {
      expect(mar.minimum.capital).toBe(pesos(700_000));
      expect(mar.minimum.interest).toBe(pesos(28_000));
      expect(mar.minimum.total).toBe(pesos(763_000));
    });

    it('pago total de 1.463.000', () => {
      expect(mar.fullPayment.capital).toBe(pesos(1_400_000));
      expect(mar.fullPayment.total).toBe(pesos(1_463_000));
    });
  });

  describe('casos borde', () => {
    it('un corte sin compras solo cobra cuota de manejo y seguro', () => {
      const jun = statement(card, rows, '2026-06-15');
      expect(jun.lines).toHaveLength(0);
      expect(jun.minimum.total).toBe(pesos(35_000));
      expect(jun.fullPayment.total).toBe(pesos(35_000));
    });

    it('con corte el 31, febrero corta el 28 y es una fecha válida', () => {
      const card31 = { ...card, cutDay: 31 };
      expect(() => statement(card31, [], '2026-02-28')).not.toThrow();
    });

    it('rechaza una fecha que no es de corte de la tarjeta', () => {
      expect(() => statement(card, rows, '2026-02-14')).toThrow(RangeError);
    });
  });
});

describe('cupo usado', () => {
  it('cuenta el capital no pagado de las compras hechas hasta ese día', () => {
    expect(usedCredit(purchases, rows, '2026-01-25')).toBe(pesos(1_200_000));
    expect(usedCredit(purchases, rows, '2026-02-25')).toBe(pesos(2_100_000));
  });

  it('cada cuota libera cupo en su fecha límite de pago', () => {
    // El 5 de marzo se pagan A1 (400.000) y B (300.000)
    expect(usedCredit(purchases, rows, '2026-03-04')).toBe(pesos(2_100_000));
    expect(usedCredit(purchases, rows, '2026-03-05')).toBe(pesos(1_400_000));
  });

  it('cuando todo está pagado el cupo usado es 0', () => {
    expect(usedCredit(purchases, rows, '2026-05-05')).toBe(0);
  });

  it('utilization = cupo usado / cupo total', () => {
    expect(utilization(card, purchases, rows, '2026-02-25').toString()).toBe('0.42');
    expect(utilization(card, purchases, rows, '2026-03-05').toString()).toBe('0.28');
  });
});
