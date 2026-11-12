import Decimal from 'decimal.js';
import { RateHistory } from '@greenlight/engine';
import { CreditCard } from '../../products/entities/credit-card.entity';
import { Loan } from '../../products/entities/loan.entity';
import { ProductRate } from '../../products/entities/product-rate.entity';
import { Expense } from '../../movements/entities/expense.entity';
import { CapitalPayment } from '../../movements/entities/capital-payment.entity';
import { RecurringIncome } from '../../incomes/entities/recurring-income.entity';
import { OneOffIncome } from '../../incomes/entities/one-off-income.entity';
import { FixedExpense } from '../../incomes/entities/fixed-expense.entity';
import { Settings } from '../../settings/entities/settings.entity';
import {
  toCardCapitalPayment,
  toCardPurchase,
  toCashExpense,
  toEngineCard,
  toEngineLoan,
  toEngineSettings,
  toFixedExpense,
  toLoanPrepayment,
  toOneOffIncome,
  toRateHistory,
  toRecurringIncome,
} from './index';

// Va en apps/api/src/projection/mappers/. Los mappers son funciones puras: entidad (lo que
// guarda la base) -> tipo del motor. No consultan la base ni usan Nest.
// Datos ficticios.

/** Crea una entidad como la devolvería TypeORM (los transformers ya aplicados). */
const make = <T extends object>(Entity: new () => T, fields: Partial<T>): T => Object.assign(new Entity(), fields);

const D = (v: string) => new Decimal(v);

const rate = (productId: number, effectiveFrom: string, ea: string, mv: string) =>
  make(ProductRate, { id: 1, productId, effectiveFrom, ea: D(ea), mv: D(mv), source: 'ea' });

describe('toRateHistory', () => {
  const rates = [rate(7, '2026-03-01', '0.2600', '0.019514'), rate(7, '2026-01-01', '0.2899', '0.021432916942')];

  it('arma el historial sin importar el orden en que lleguen las filas', () => {
    const history = toRateHistory(rates);
    expect(history).toBeInstanceOf(RateHistory);
    expect(history.rateOn('2026-02-15').ea.equals(D('0.2899'))).toBe(true);
    expect(history.rateOn('2026-03-01').ea.equals(D('0.26'))).toBe(true);
  });

  it('usa la E.A. y la M.V. guardadas tal cual, sin recalcular', () => {
    // La M.V. guardada de marzo no es exactamente la equivalente de 0,26: igual se respeta
    expect(toRateHistory(rates).rateOn('2026-03-10').mv.toString()).toBe('0.019514');
  });

  it('sin filas: el historial queda vacío y pedir una tasa falla', () => {
    expect(() => toRateHistory([]).rateOn('2026-01-01')).toThrow();
  });
});

describe('toEngineCard', () => {
  const card = make(CreditCard, {
    productId: 7,
    creditLimitCents: 500_000_000,
    cutDay: 15,
    dueDay: 5,
    handlingFeeCents: 3_000_000,
    insuranceCents: 500_000,
    minPaymentMethod: 'constant_capital',
    singleInstallmentInterestFree: true,
    firstPeriodInterest: 'full_month',
  });
  const result = toEngineCard(card, [rate(7, '2026-01-01', '0.2899', '0.021432916942')]);

  it('pasa los campos con los nombres del motor y el id como string', () => {
    expect(result).toMatchObject({
      id: '7',
      cutDay: 15,
      dueDay: 5,
      creditLimit: 500_000_000,
      handlingFee: 3_000_000,
      insurance: 500_000,
      minPaymentMethod: 'constant_capital',
      singleInstallmentInterestFree: true,
      firstPeriodInterest: 'full_month',
    });
  });

  it('trae sus tasas', () => {
    expect(result.rates.rateOn('2026-06-01').ea.equals(D('0.2899'))).toBe(true);
  });

  it('rechaza tasas de otro producto (el service las filtró mal)', () => {
    expect(() => toEngineCard(card, [rate(8, '2026-01-01', '0.2899', '0.021432916942')])).toThrow(/producto/i);
  });
});

describe('toEngineLoan', () => {
  const loan = make(Loan, {
    productId: 9,
    principalCents: 1_000_000_000,
    termMonths: 12,
    firstPaymentDate: '2026-02-10',
    fixedPaymentCents: null,
    insuranceCents: 1_200_000,
    method: 'fixed_installment',
  });
  const rates = [rate(9, '2026-01-01', '0.195618', '0.015')];

  it('pasa los campos con los nombres del motor', () => {
    expect(toEngineLoan(loan, rates)).toMatchObject({
      id: '9',
      principal: 1_000_000_000,
      termMonths: 12,
      firstPaymentDate: '2026-02-10',
      insurance: 1_200_000,
      method: 'fixed_installment',
    });
  });

  it('sin cuota informada: fixedPayment no viene (el motor la calcula)', () => {
    expect(toEngineLoan(loan, rates).fixedPayment).toBeUndefined();
  });

  it('con cuota informada: la pasa', () => {
    expect(toEngineLoan({ ...loan, fixedPaymentCents: 91_679_993 }, rates).fixedPayment).toBe(91_679_993);
  });
});

describe('gastos: tarjeta o efectivo', () => {
  const base = make(Expense, {
    id: 31,
    date: '2026-03-12',
    amountCents: 120_000_000,
    categoryId: null,
    description: 'Televisor',
    sourceProductId: 7,
    installments: 3,
    promoEa: null,
    promoMv: null,
    promoDescription: '',
    isOpeningDebt: false,
  });

  describe('toCardPurchase', () => {
    it('una compra con tarjeta', () => {
      expect(toCardPurchase(base)).toEqual({
        id: '31',
        cardId: '7',
        date: '2026-03-12',
        amount: 120_000_000,
        installments: 3,
      });
    });

    it('sin promoción no trae promoRate', () => {
      expect('promoRate' in toCardPurchase(base)).toBe(false);
    });

    it('con promoción trae su tasa', () => {
      const promo = toCardPurchase({ ...base, promoEa: D('0'), promoMv: D('0') });
      expect(promo.promoRate?.ea.isZero()).toBe(true);
      expect(promo.promoRate?.mv.isZero()).toBe(true);
    });

    it('rechaza un gasto sin cuotas: no es una compra con tarjeta', () => {
      expect(() => toCardPurchase({ ...base, installments: null })).toThrow(/cuotas/i);
    });
  });

  describe('toCashExpense', () => {
    it('un gasto desde una cuenta', () => {
      expect(toCashExpense({ ...base, installments: null, description: 'Mercado' })).toEqual({
        id: '31',
        date: '2026-03-12',
        amount: 120_000_000,
        description: 'Mercado',
      });
    });
  });
});

describe('abonos a capital', () => {
  const abono = make(CapitalPayment, {
    id: 4,
    productId: 7,
    date: '2026-03-25',
    amountCents: 20_000_000,
    mode: 'reduce_term',
    expenseId: 31,
  });

  it('a una compra de la tarjeta', () => {
    expect(toCardCapitalPayment(abono)).toEqual({
      id: '4',
      cardId: '7',
      purchaseId: '31',
      date: '2026-03-25',
      amount: 20_000_000,
      mode: 'reduce_term',
    });
  });

  it('sin compra: el motor lo reparte por mayor tasa (purchaseId no viene)', () => {
    expect('purchaseId' in toCardCapitalPayment({ ...abono, expenseId: null })).toBe(false);
  });

  it('a un préstamo', () => {
    expect(toLoanPrepayment({ ...abono, productId: 9, expenseId: null, mode: 'reduce_payment' })).toEqual({
      id: '4',
      loanId: '9',
      date: '2026-03-25',
      amount: 20_000_000,
      mode: 'reduce_payment',
    });
  });

  it('un abono a préstamo no puede apuntar a una compra', () => {
    expect(() => toLoanPrepayment(abono)).toThrow(/compra/i);
  });
});

describe('ingresos y gastos fijos', () => {
  it('toRecurringIncome: day/start/end con los nombres del motor; sin fin, end no viene', () => {
    const salary = make(RecurringIncome, {
      id: 1,
      name: 'Salario',
      amountCents: 300_000_000,
      dayOfMonth: 30,
      startDate: '2026-01-01',
      endDate: null,
      destinationAccountId: null,
    });
    const result = toRecurringIncome(salary);
    expect(result).toEqual({ id: '1', name: 'Salario', amount: 300_000_000, day: 30, start: '2026-01-01' });
    expect('end' in result).toBe(false);
    expect(toRecurringIncome({ ...salary, endDate: '2026-12-31' }).end).toBe('2026-12-31');
  });

  it('toOneOffIncome', () => {
    const bonus = make(OneOffIncome, {
      id: 2,
      date: '2026-06-20',
      amountCents: 50_000_000,
      description: 'Prima',
      categoryId: null,
      destinationAccountId: null,
    });
    expect(toOneOffIncome(bonus)).toEqual({ id: '2', date: '2026-06-20', amount: 50_000_000, description: 'Prima' });
  });

  describe('toFixedExpense', () => {
    const rent = make(FixedExpense, {
      id: 3,
      name: 'Arriendo',
      amountCents: 120_000_000,
      dayOfMonth: 1,
      categoryId: null,
      startDate: '2026-01-01',
      endDate: null,
      cardId: null,
    });

    it('sin tarjeta: sale del disponible (cardId no viene)', () => {
      const result = toFixedExpense(rent);
      expect(result).toEqual({ id: '3', name: 'Arriendo', amount: 120_000_000, day: 1, start: '2026-01-01' });
      expect('cardId' in result).toBe(false);
    });

    it('con tarjeta: el motor lo vuelve compra a 1 cuota (cardId como string)', () => {
      expect(toFixedExpense({ ...rent, name: 'Netflix', cardId: 7 }).cardId).toBe('7');
    });
  });
});

describe('toEngineSettings', () => {
  const row = make(Settings, {
    id: 1,
    yellowBelowIncomePct: D('0.1000'),
    cardUtilizationPct: D('0.3000'),
    debtToIncomePct: D('0.3000'),
    statementTolerancePct: D('0.0200'),
  });

  it('devuelve solo los 4 umbrales, sin el id de la fila', () => {
    const settings = toEngineSettings(row);
    expect(Object.keys(settings).sort()).toEqual([
      'cardUtilizationPct',
      'debtToIncomePct',
      'statementTolerancePct',
      'yellowBelowIncomePct',
    ]);
    expect(settings.statementTolerancePct.equals(D('0.02'))).toBe(true);
  });
});

describe('afterBalance en los mappers', () => {
  const expense = make(Expense, {
    id: 31,
    date: '2026-03-12',
    amountCents: 120_000_000,
    sourceProductId: 3,
    installments: null,
    description: 'Mercado',
  });
  const bonus = make(OneOffIncome, { id: 2, date: '2026-06-20', amountCents: 50_000_000, description: 'Prima' });

  it('lo agregan solo cuando es true; sin él, la salida no trae la propiedad', () => {
    expect(toCashExpense(expense, true)).toMatchObject({ afterBalance: true });
    expect(toCashExpense(expense, false)).not.toHaveProperty('afterBalance');
    expect(toCashExpense(expense)).not.toHaveProperty('afterBalance');
    expect(toOneOffIncome(bonus, true)).toMatchObject({ afterBalance: true });
    expect(toOneOffIncome(bonus)).not.toHaveProperty('afterBalance');
  });
});
