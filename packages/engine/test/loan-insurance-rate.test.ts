import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { type Loan, type LoanPrepayment, loanSchedule } from '../src/loans';

// Préstamo A (extracto de Rappi): quedan 14 cuotas desde la 6, con saldo de 3.046.422,09 antes de pagarla.
// La cuota 6 del extracto: capital 181.755,50 + interés 59.754,96 + seguro 7.141,55. El seguro es un porcentaje
// mensual del saldo (≈ 0,2344 %), así que baja cada mes.
const rates = new RateHistory();
rates.add('2026-01-01', rateFromMv('0.0196148'));

const rappi: Loan = {
  id: 'rappi',
  principal: pesos('3046422.09'),
  termMonths: 14,
  firstPaymentDate: '2026-10-31',
  rates,
  method: 'fixed_installment',
  fixedPayment: pesos('241510.46'), // capital + interés, sin seguro
  insurance: 0,
  insuranceRate: new Decimal('0.002344'),
};

const prepay = (overrides: Partial<LoanPrepayment> = {}): LoanPrepayment => ({
  id: 'pp',
  loanId: 'rappi',
  date: '2026-11-15',
  amount: pesos(1_000_000),
  mode: 'reduce_payment',
  ...overrides,
});

describe('seguro como porcentaje del saldo', () => {
  const rows = loanSchedule(rappi);

  it('la primera cuota: 0,2344 % de 3.046.422,09 da unos $7.141', () => {
    expect(Math.abs((rows[0]?.insurance ?? 0) - pesos('7141.55'))).toBeLessThan(pesos(1));
  });

  it('el seguro es el redondeo exacto de saldo × tasa y baja cada mes', () => {
    expect(rows[0]?.insurance).toBe(Math.round(rows[0]!.openingBalance * 0.002344));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]?.insurance).toBeLessThan(rows[i - 1]?.insurance ?? 0);
    }
  });

  it('el seguro no cambia el capital ni el interés: igual a un préstamo sin seguro', () => {
    const without = loanSchedule({ ...rappi, insuranceRate: undefined });
    const strip = (r: (typeof rows)[number]) => ({ capital: r.capital, interest: r.interest, closing: r.closingBalance });
    expect(rows.map(strip)).toEqual(without.map(strip));
    expect(without.every((r) => r.insurance === 0)).toBe(true);
  });

  it('capital + interés de la cuota 6 es el del extracto, y el total suma el seguro', () => {
    const first = rows[0]!;
    expect(first.capital + first.interest).toBe(pesos('241510.46'));
    expect(first.total).toBe(first.payment + first.insurance);
  });

  it('un abono que reduce la cuota también baja el seguro de las cuotas siguientes', () => {
    const base = loanSchedule(rappi);
    const after = loanSchedule(rappi, [prepay()]);
    // El abono de noviembre entra en la cuota 2 (30 nov): ya con el saldo menor
    expect(after[1]?.insurance).toBeLessThan(base[1]?.insurance ?? 0);
    expect(after[3]?.insurance).toBeLessThan(base[3]?.insurance ?? 0);
    // La primera cuota (antes del abono) no cambia
    expect(after[0]?.insurance).toBe(base[0]?.insurance);
  });

  it('la fila liquidada ya no paga seguro', () => {
    const payoff = loanSchedule(rappi, [prepay({ amount: pesos('2900000'), mode: 'reduce_term' })]);
    const last = payoff[payoff.length - 1]!;
    expect(last.closingBalance).toBe(0);
    // Tras el abono grande, las filas sin pago tienen seguro 0
    for (const row of payoff.filter((r) => r.payment === 0)) expect(row.insurance).toBe(0);
  });

  it('seguro fijo y seguro por tasa a la vez: error', () => {
    expect(() => loanSchedule({ ...rappi, insurance: pesos(7_000) })).toThrow(/solo uno/);
  });

  it('una tasa de seguro negativa: error', () => {
    expect(() => loanSchedule({ ...rappi, insuranceRate: new Decimal('-0.001') })).toThrow(RangeError);
  });

  it('sin tasa de seguro sigue funcionando el seguro fijo de siempre', () => {
    const fixed = loanSchedule({ ...rappi, insuranceRate: undefined, insurance: pesos(12_000) });
    expect(fixed.every((r) => r.insurance === pesos(12_000))).toBe(true);
  });
});

describe('tasa registrada después del inicio del primer periodo', () => {
  // Un préstamo que ya venía en curso: la tasa se registra hoy (12 nov) y la próxima cuota es hoy mismo,
  // así que el periodo arranca el 12 oct, antes de la primera tasa.
  const late = new RateHistory();
  late.add('2026-11-12', rateFromMv('0.0407'));
  const inProgress: Loan = {
    id: 'nu',
    principal: pesos('351236.72'),
    termMonths: 20,
    firstPaymentDate: '2026-11-12',
    rates: late,
    method: 'fixed_installment',
    fixedPayment: pesos('26611.73'),
    insurance: 0,
  };

  it('usa la primera tasa conocida en vez de fallar', () => {
    const rows = loanSchedule(inProgress);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.interest).toBe(Math.round(pesos('351236.72') * 0.0407));
  });

  it('con el mismo resultado que si la tasa se hubiera registrado antes', () => {
    const early = new RateHistory();
    early.add('2026-01-01', rateFromMv('0.0407'));
    expect(loanSchedule({ ...inProgress, rates: early })).toEqual(loanSchedule(inProgress));
  });

  it('sin ninguna tasa sigue fallando', () => {
    expect(() => loanSchedule({ ...inProgress, rates: new RateHistory() })).toThrow(/No hay tasa vigente/);
  });
});
