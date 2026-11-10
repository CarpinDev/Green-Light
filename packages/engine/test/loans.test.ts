import { describe, expect, it } from 'vitest';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { schedule } from '../src/amortization';
import { shiftMonths } from '../src/calendar';
import { type Loan, type LoanPrepayment, loanDueDates, loanSchedule, payoffAmount } from '../src/loans';

// Préstamo ficticio: 10.000.000 a 12 meses al 1,5 % M.V., primera cuota el 10 de febrero,
// seguro de 12.000 al mes. Cuota calculada: $916.799,93
const fixedRate = new RateHistory();
fixedRate.add('2026-01-01', rateFromMv('0.015'));

const loan: Loan = {
  id: 'loan-1',
  principal: pesos(10_000_000),
  termMonths: 12,
  firstPaymentDate: '2026-02-10',
  rates: fixedRate,
  method: 'fixed_installment',
  insurance: pesos(12_000),
};

const prepay = (overrides: Partial<LoanPrepayment> = {}): LoanPrepayment => ({
  id: 'pp-1',
  loanId: 'loan-1',
  date: '2026-04-15',
  amount: pesos(2_000_000),
  mode: 'reduce_term',
  ...overrides,
});

describe('shiftMonths (calendar)', () => {
  it('mueve una fecha N meses conservando el día indicado', () => {
    expect(shiftMonths('2026-02-10', 3, 10)).toBe('2026-05-10');
    expect(shiftMonths('2026-02-10', -1, 10)).toBe('2026-01-10');
  });

  it('usa el último día cuando el día no existe en el mes', () => {
    expect(shiftMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(shiftMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('loans', () => {
  describe('loanDueDates', () => {
    it('una fecha de pago por mes desde la primera cuota', () => {
      const dates = loanDueDates(loan);
      expect(dates).toHaveLength(12);
      expect(dates[0]).toBe('2026-02-10');
      expect(dates[11]).toBe('2027-01-10');
    });

    it('con pago el 31 usa el último día de los meses cortos y vuelve al 31', () => {
      const dates = loanDueDates({ ...loan, firstPaymentDate: '2026-01-31', termMonths: 3 });
      expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });
  });

  describe('loanSchedule: tasa fija', () => {
    const rows = loanSchedule(loan);

    it('cuota fija de 916.799,93 y la última ajusta el centavo', () => {
      expect(rows[0]?.payment).toBe(91_679_993);
      expect(rows[10]?.payment).toBe(91_679_993);
      expect(rows[11]?.payment).toBe(91_679_992);
      expect(rows[11]?.closingBalance).toBe(0);
    });

    it('cada fila trae su fecha de pago, el seguro y el total a pagar', () => {
      expect(rows[0]?.dueDate).toBe('2026-02-10');
      expect(rows[0]?.loanId).toBe('loan-1');
      expect(rows[0]?.insurance).toBe(pesos(12_000));
      expect(rows[0]?.total).toBe(92_879_993);
    });

    it('da lo mismo que schedule con la misma tasa (no reinventa la amortización)', () => {
      const plain = schedule(pesos(10_000_000), 12, [rateFromMv('0.015').mv], 'fixed_installment');
      expect(rows.map((r) => r.capital)).toEqual(plain.map((r) => r.capital));
    });
  });

  describe('loanSchedule: tasa variable', () => {
    // Baja a 1,2 % desde el 1 de junio. Cada cuota usa la tasa vigente al INICIO de su periodo
    // (un mes antes de la fecha de pago): la cuota de junio 10 arrancó el 10 de mayo, así que
    // sigue al 1,5 %; la de julio 10 arrancó el 10 de junio y ya usa 1,2 %.
    const variable = new RateHistory();
    variable.add('2026-01-01', rateFromMv('0.015'));
    variable.add('2026-06-01', rateFromMv('0.012'));
    const rows = loanSchedule({ ...loan, rates: variable });

    it('la cuota de junio 10 sigue con la tasa anterior', () => {
      expect(rows[4]?.dueDate).toBe('2026-06-10');
      expect(rows[4]?.interest).toBe(10_294_643);
      expect(rows[4]?.payment).toBe(91_679_993);
    });

    it('desde julio la cuota se recalcula con la tasa nueva sobre el plazo restante', () => {
      expect(rows[5]?.interest).toBe(7_259_090);
      expect(rows[5]?.payment).toBe(90_615_270);
      expect(rows[11]?.closingBalance).toBe(0);
    });
  });

  describe('cuota informada por el banco', () => {
    const rows = loanSchedule({ ...loan, fixedPayment: pesos(917_000) });

    it('usa la cuota del banco en vez de calcularla', () => {
      expect(rows[0]?.payment).toBe(pesos(917_000));
      expect(rows[0]?.capital).toBe(pesos(767_000));
    });

    it('la última cuota liquida el saldo', () => {
      expect(rows).toHaveLength(12);
      expect(rows[11]?.payment).toBe(91_439_086);
      expect(rows[11]?.closingBalance).toBe(0);
    });

    it('schedule rechaza una cuota inicial en abono constante o no positiva', () => {
      expect(() =>
        schedule(pesos(1_000_000), 12, [rateFromMv('0.01').mv], 'constant_capital', { initialPayment: pesos(90_000) }),
      ).toThrow(RangeError);
      expect(() =>
        schedule(pesos(1_000_000), 12, [rateFromMv('0.01').mv], 'fixed_installment', { initialPayment: 0 }),
      ).toThrow(RangeError);
    });
  });

  describe('abonos a capital', () => {
    const rows = loanSchedule(loan, [prepay()]);

    it('un abono del 15 de abril entra antes de la cuota de mayo, con su fecha', () => {
      expect(rows[3]?.dueDate).toBe('2026-05-10');
      expect(rows[3]?.prepayment).toBe(pesos(2_000_000));
      expect(rows[3]?.prepaymentDate).toBe('2026-04-15');
      expect(rows[3]?.openingBalance).toBe(566_492_168);
    });

    it('reducir plazo: misma cuota y el préstamo termina en noviembre', () => {
      expect(rows).toHaveLength(10);
      expect(rows[3]?.payment).toBe(91_679_993);
      expect(rows[9]?.dueDate).toBe('2026-11-10');
      expect(rows[9]?.payment).toBe(49_026_387);
    });

    it('un abono el mismo día de una cuota aplica después de esa cuota', () => {
      const sameDay = loanSchedule(loan, [prepay({ date: '2026-04-10' })]);
      expect(sameDay[2]?.prepayment).toBe(0);
      expect(sameDay[3]?.prepayment).toBe(pesos(2_000_000));
    });

    it('rechaza abonos de otro préstamo o cuando ya pasó la última cuota', () => {
      expect(() => loanSchedule(loan, [prepay({ loanId: 'otro' })])).toThrow();
      expect(() => loanSchedule(loan, [prepay({ date: '2027-01-10' })])).toThrow(RangeError);
    });
  });

  describe('payoffAmount: cuánto debes en una fecha', () => {
    const payments = [prepay()];

    it('antes de la primera cuota se debe todo el capital', () => {
      expect(payoffAmount(loan, '2026-02-09', payments)).toBe(pesos(10_000_000));
    });

    it('el día de pago de abril baja con la cuota 3', () => {
      expect(payoffAmount(loan, '2026-04-10', payments)).toBe(766_492_168);
    });

    it('el día del abono baja con el abono', () => {
      expect(payoffAmount(loan, '2026-04-15', payments)).toBe(566_492_168);
    });

    it('después de la última cuota es 0', () => {
      expect(payoffAmount(loan, '2026-12-31', payments)).toBe(0);
    });
  });
});
