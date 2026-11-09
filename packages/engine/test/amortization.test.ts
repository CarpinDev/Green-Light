import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos, roundCents } from '../src/money';
import { fixedPayment, schedule } from '../src/amortization';

const R1 = new Decimal('0.01'); // 1 % M.V.
const R0 = new Decimal(0);

describe('amortization', () => {
  describe('fixedPayment: cuota fija (sistema francés)', () => {
    it('1.000.000 al 1 % M.V. a 12 meses da $88.848,79', () => {
      expect(fixedPayment(pesos(1_000_000), R1, 12)).toBe(8_884_879);
    });

    it('con tasa 0 la cuota es principal / n', () => {
      expect(fixedPayment(pesos(1_200_000), R0, 12)).toBe(pesos(100_000));
    });
  });

  describe('schedule: abono constante a capital', () => {

    const rows = schedule(pesos(1_200_000), 12, [R1], 'constant_capital');

    it('el capital es fijo y el interés se calcula sobre el saldo', () => {
      expect(rows[0]?.capital).toBe(pesos(100_000));
      expect(rows[0]?.interest).toBe(pesos(12_000));
      expect(rows[1]?.interest).toBe(pesos(11_000));
      expect(rows[11]?.interest).toBe(pesos(1_000));
    });

    it('el total de intereses es $78.000', () => {
      const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0);
      expect(totalInterest).toBe(pesos(78_000));
    });

    it('genera exactamente n cuotas y cierra en saldo 0', () => {
      expect(rows).toHaveLength(12);
      expect(rows[11]?.closingBalance).toBe(0);
    });

    it('cada cuota empieza con el saldo con que terminó la anterior', () => {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]?.openingBalance).toBe(rows[i - 1]?.closingBalance);
      }
    });

    it('reparte centavos indivisibles sin perder ni sobrar nada', () => {
      const split = schedule(100, 3, [R0], 'constant_capital');
      expect(split.map(r => r.capital)).toEqual([33, 33, 34]);
    });
  });

  describe('schedule: cuota fija', () => {
    const principal = pesos(1_000_000);
    const rows = schedule(principal, 12, [R1], 'fixed_installment');
    const payment = (i: number) => (rows[i]?.capital ?? 0) + (rows[i]?.interest ?? 0);

    it('todas las cuotas valen lo mismo (±1 centavo por redondeo)', () => {
      for (let i = 0; i < 11; i++) {
        expect(Math.abs(payment(i) - 8_884_879)).toBeLessThanOrEqual(1);
      }
    });

    it('la última cuota absorbe el redondeo y la tabla cierra en 0', () => {
      expect(Math.abs(payment(11) - 8_884_879)).toBeLessThanOrEqual(12);
      expect(rows[11]?.closingBalance).toBe(0);
    });

    it('la suma de los capitales es exactamente el principal', () => {
      expect(rows.reduce((sum, r) => sum + r.capital, 0)).toBe(principal);
    });
  });

  describe('schedule: tasa variable', () => {
    const rates = [...Array(6).fill(R1), ...Array(6).fill(new Decimal('0.02'))];
    const rows = schedule(pesos(1_000_000), 12, rates, 'fixed_installment');

    it('si la tasa sube, la cuota se recalcula y sube', () => {
      const p = (i: number) => (rows[i]?.capital ?? 0) + (rows[i]?.interest ?? 0);
      expect(p(6)).toBeGreaterThan(p(5));
    });

    it('cada cuota usa la tasa de su periodo', () => {
      const r = rows[6]!;
      expect(r.interest).toBe(roundCents(new Decimal(r.openingBalance).times('0.02')));
    });

    it('aun con tasa variable cierra en 0', () => {
      expect(rows[11]?.closingBalance).toBe(0);
    });

    it('si hay menos tasas que cuotas, repite la última', () => {
      const short = schedule(pesos(1_200_000), 3, [R1], 'constant_capital');
      expect(short[2]?.interest).toBe(pesos(4_000)); // 400.000 × 1 %
    });
  });

  describe('schedule: tasa de la primera cuota', () => {
    it('firstPeriodRate solo cambia el interés de la cuota 1', () => {
      const rows = schedule(pesos(1_000_000), 2, [R1], 'constant_capital', {
        firstPeriodRate: R0,
      });
      expect(rows[0]?.interest).toBe(0);
      expect(rows[1]?.interest).toBe(pesos(5_000)); // 500.000 × 1 %
    });
  });

  describe('validaciones', () => {
    it.each([
      [0, 1, 'principal en 0'],
      [-100, 1, 'principal negativo'],
      [100, 0, 'cero cuotas'],
    ])('rechaza principal=%i, n=%i (%s)', (principal, n) => {
      expect(() => schedule(principal, n, [R1], 'constant_capital')).toThrow();
    });

    it('rechaza una lista de tasas vacía', () => {
      expect(() => schedule(100, 1, [], 'constant_capital')).toThrow();
    });
  });
});
