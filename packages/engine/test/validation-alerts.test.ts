import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { type CardPurchase, type CreditCard, planPurchase } from '../src/cards';
import type { CashEvent, MonthSummary } from '../src/projection';
import { checkStatement, compareMinimum } from '../src/validation';
import { DEFAULT_SETTINGS, cardUtilizationAlert, debtToIncomeAlert } from '../src/alerts';

const TWO_PCT = new Decimal('0.02');
const THIRTY_PCT = new Decimal('0.30');

// Mismo escenario de statement.test.ts: corte el 15, pago el 5, 2 % M.V., cupo 5.000.000,
// manejo 30.000 + seguro 5.000. El mínimo calculado del corte de febrero es 759.000
const rates = new RateHistory();
rates.add('2026-01-01', rateFromMv('0.02'));
const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates,
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
const purchases = [buy('A', '2026-01-20', 1_200_000, 3), buy('B', '2026-02-10', 300_000, 1), buy('C', '2026-02-20', 600_000, 2)];
const rows = purchases.flatMap((p) => planPurchase(card, p));

describe('DEFAULT_SETTINGS', () => {
  it('trae los umbrales por defecto del modelo', () => {
    expect(DEFAULT_SETTINGS.yellowBelowIncomePct.toString()).toBe('0.1');
    expect(DEFAULT_SETTINGS.cardUtilizationPct.toString()).toBe('0.3');
    expect(DEFAULT_SETTINGS.debtToIncomePct.toString()).toBe('0.3');
    expect(DEFAULT_SETTINGS.statementTolerancePct.toString()).toBe('0.02');
  });

  it('no se puede modificar', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});

describe('validation: mínimo calculado vs el del banco', () => {
  describe('compareMinimum', () => {
    it('una diferencia de 4.000 sobre 490.000 (0,82 %) está dentro del 2 %', () => {
      const check = compareMinimum(pesos(486_000), pesos(490_000), TWO_PCT);
      expect(check.difference).toBe(-pesos(4_000));
      expect(check.relativeDifference.toString()).toBe('0.0082');
      expect(check.withinTolerance).toBe(true);
    });

    it('una diferencia de 14.000 sobre 500.000 (2,8 %) está fuera', () => {
      const check = compareMinimum(pesos(486_000), pesos(500_000), TWO_PCT);
      expect(check.relativeDifference.toString()).toBe('0.028');
      expect(check.withinTolerance).toBe(false);
    });

    it('exactamente el 2 % todavía está dentro', () => {
      expect(compareMinimum(pesos(510_000), pesos(500_000), TWO_PCT).withinTolerance).toBe(true);
    });

    it('la diferencia lleva signo: positiva si el motor calcula más que el banco', () => {
      expect(compareMinimum(pesos(510_000), pesos(500_000), TWO_PCT).difference).toBe(pesos(10_000));
    });

    it('si el banco cobra 0: coincide solo si el motor también da 0', () => {
      expect(compareMinimum(0, 0, TWO_PCT).withinTolerance).toBe(true);
      expect(compareMinimum(pesos(100), 0, TWO_PCT).withinTolerance).toBe(false);
    });

    it('rechaza un mínimo del banco negativo o con decimales', () => {
      expect(() => compareMinimum(0, -1, TWO_PCT)).toThrow(RangeError);
      expect(() => compareMinimum(0, 10.5, TWO_PCT)).toThrow(RangeError);
    });
  });

  describe('checkStatement', () => {
    it('calcula el extracto del corte y lo compara con lo que dice el banco', () => {
      const check = checkStatement(card, rows, '2026-02-15', pesos(760_000), TWO_PCT);
      expect(check.calculatedMinimum).toBe(pesos(759_000));
      expect(check.bankMinimum).toBe(pesos(760_000));
      expect(check.withinTolerance).toBe(true);
    });

    it('detecta un extracto que no cuadra (p. ej. una compra sin registrar)', () => {
      const check = checkStatement(card, rows, '2026-02-15', pesos(900_000), TWO_PCT);
      expect(check.withinTolerance).toBe(false);
    });
  });
});

describe('alerts', () => {
  describe('cardUtilizationAlert: cupo usado > 30 %', () => {
    it('42 % el 25 de febrero: alerta con el valor y el umbral', () => {
      const alert = cardUtilizationAlert(card, purchases, rows, '2026-02-25', THIRTY_PCT);
      expect(alert?.kind).toBe('card_utilization');
      expect(alert?.refId).toBe('card-1');
      expect(alert?.value.toString()).toBe('0.42');
      expect(alert?.threshold.toString()).toBe('0.3');
    });

    it('28 % el 5 de marzo: sin alerta', () => {
      expect(cardUtilizationAlert(card, purchases, rows, '2026-03-05', THIRTY_PCT)).toBeUndefined();
    });

    it('exactamente el 30 % no alerta (debe superarlo)', () => {
      const exact = [buy('X', '2026-01-20', 1_500_000, 3)];
      const exactRows = exact.flatMap((p) => planPurchase(card, p));
      expect(cardUtilizationAlert(card, exact, exactRows, '2026-01-25', THIRTY_PCT)).toBeUndefined();
    });
  });

  describe('debtToIncomeAlert: pagos de deuda > 30 % del ingreso del mes', () => {
    const ev = (kind: CashEvent['kind'], amount: number): CashEvent => ({
      date: '2026-04-05',
      kind,
      amount: pesos(amount),
      label: '',
      refId: 'x',
    });
    const month = (events: CashEvent[], referenceIncome: number): MonthSummary => ({
      month: '2026-04',
      openingBalance: 0,
      income: 0,
      outflow: 0,
      closingBalance: 0,
      lowestBalance: 0,
      referenceIncome: pesos(referenceIncome),
      light: 'green',
      events,
    });

    it('mínimo de tarjeta + cuota de préstamo = 36,67 % del ingreso: alerta', () => {
      const alert = debtToIncomeAlert(
        month([ev('card_payment', -500_000), ev('loan_payment', -600_000), ev('income', 3_000_000)], 3_000_000),
        THIRTY_PCT,
      );
      expect(alert?.kind).toBe('debt_to_income');
      expect(alert?.refId).toBe('2026-04');
      expect(alert?.value.toString()).toBe('0.3667');
    });

    it('los abonos a capital son voluntarios: no cuentan como carga de deuda', () => {
      const alert = debtToIncomeAlert(
        month([ev('loan_payment', -600_000), ev('capital_payment', -2_000_000)], 3_000_000),
        THIRTY_PCT,
      );
      expect(alert).toBeUndefined();
    });

    it('exactamente el 30 % no alerta', () => {
      expect(debtToIncomeAlert(month([ev('loan_payment', -900_000)], 3_000_000), THIRTY_PCT)).toBeUndefined();
    });

    it('sin deudas en el mes no hay alerta, aunque no haya ingreso', () => {
      expect(debtToIncomeAlert(month([], 0), THIRTY_PCT)).toBeUndefined();
    });

    it('con deudas y sin ingreso en el mes: alerta', () => {
      expect(debtToIncomeAlert(month([ev('loan_payment', -100_000)], 0), THIRTY_PCT)?.kind).toBe('debt_to_income');
    });
  });
});
