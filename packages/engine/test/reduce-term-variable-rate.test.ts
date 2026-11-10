import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { periodsToPayOff, schedule } from '../src/amortization';
import { type Loan, loanSchedule } from '../src/loans';

const R = (mv: string) => new Decimal(mv);

describe('periodsToPayOff: cuántas cuotas faltan con una cuota dada', () => {
  it('un crédito nuevo con su propia cuota da su plazo original, pese al redondeo de la cuota', () => {
    // 10.000.000 al 1,5 % → cuota 916.799,93 (redondeada al centavo)
    expect(periodsToPayOff(pesos(10_000_000), R('0.015'), 91_679_993)).toBe(12);
  });

  it('tras abonar, la misma cuota alcanza en menos cuotas (se redondea hacia arriba)', () => {
    expect(periodsToPayOff(566_492_168, R('0.015'), 91_679_993)).toBe(7);
  });

  it('con tasa 0 es saldo / cuota hacia arriba', () => {
    expect(periodsToPayOff(pesos(1_000_000), R('0'), pesos(300_000))).toBe(4);
  });

  it('rechaza una cuota que no alcanza a cubrir el interés', () => {
    // 1.000.000 al 2 % genera 20.000 de interés: una cuota de 20.000 nunca amortiza
    expect(() => periodsToPayOff(pesos(1_000_000), R('0.02'), pesos(20_000))).toThrow(RangeError);
  });

  it('rechaza cuotas no positivas o con decimales', () => {
    expect(() => periodsToPayOff(pesos(1_000_000), R('0.01'), 0)).toThrow(RangeError);
    expect(() => periodsToPayOff(pesos(1_000_000), R('0.01'), 10.5)).toThrow(RangeError);
  });
});

describe('reducir plazo sobrevive a un cambio de tasa', () => {
  // Mismo préstamo de loans.test.ts: 10.000.000, 12 meses, 1,5 % y luego 1,2 % desde junio.
  // Abono de 2.000.000 el 15 de abril → con la cuota de 916.799,93 alcanzan 7 cuotas más:
  // el préstamo debe terminar en la cuota 10 (noviembre) aunque la tasa cambie en julio.
  const variable = new RateHistory();
  variable.add('2026-01-01', rateFromMv('0.015'));
  variable.add('2026-06-01', rateFromMv('0.012'));

  const loan: Loan = {
    id: 'loan-1',
    principal: pesos(10_000_000),
    termMonths: 12,
    firstPaymentDate: '2026-02-10',
    rates: variable,
    method: 'fixed_installment',
    insurance: 0,
  };

  const prepay = (mode: 'reduce_term' | 'reduce_payment') => [
    { id: 'pp', loanId: 'loan-1', date: '2026-04-15', amount: pesos(2_000_000), mode },
  ];

  it('reduce_term: sigue terminando en la cuota 10, no vuelve a 12', () => {
    const rows = loanSchedule(loan, prepay('reduce_term'));
    expect(rows).toHaveLength(10);
    expect(rows[9]?.dueDate).toBe('2026-11-10');
    expect(rows[9]?.closingBalance).toBe(0);
  });

  it('reduce_term: al bajar la tasa la cuota se recalcula sobre las 5 cuotas que quedan', () => {
    const rows = loanSchedule(loan, prepay('reduce_term'));
    expect(rows[4]?.payment).toBe(91_679_993); // junio: tasa vieja, cuota intacta
    expect(rows[5]?.payment).toBe(82_670_609); // julio: tasa nueva, mismo fin
    expect(rows[8]?.payment).toBe(82_670_609);
  });

  it('reduce_payment no cambia: conserva las 12 cuotas', () => {
    const rows = loanSchedule(loan, prepay('reduce_payment'));
    expect(rows).toHaveLength(12);
    expect(rows[3]?.payment).toBe(67_758_028);
    expect(rows[5]?.payment).toBe(66_971_123);
  });

  it('un reduce_payment después de un reduce_term respeta el plazo ya acortado', () => {
    const rows = schedule(pesos(1_000_000), 12, [R('0.01'), R('0.01'), R('0.01'), R('0.02')], 'fixed_installment', {
      prepayments: [
        { afterPeriod: 1, amount: pesos(300_000), mode: 'reduce_term' },
        { afterPeriod: 5, amount: pesos(100_000), mode: 'reduce_payment' },
      ],
    });
    expect(rows).toHaveLength(9);
    expect(rows[5]?.payment).toBe(5_497_585);
    expect(rows[8]?.closingBalance).toBe(0);
  });
});
