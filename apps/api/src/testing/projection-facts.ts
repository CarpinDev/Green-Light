import Decimal from 'decimal.js';
import { rateFromMv } from '@greenlight/engine';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Settings } from '../settings/entities/settings.entity';
import type { ProjectionFacts } from '../projection/build-projection';

// Datos ficticios compartidos por las pruebas de proyección y de simulación.
// Es el escenario de "proyección completa con deudas" de debt-events.test.ts del motor.

export const make = <T extends object>(Entity: new () => T, fields: Partial<T>): T =>
  Object.assign(new Entity(), fields);
export const pesos = (n: number) => n * 100;

/** Una hora de registro de prueba: el día (YYYY-MM-DD) y la hora UTC. */
export const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);

/** Cuándo se confirmó el saldo que fija asOf en `facts()`. */
export const BALANCE_CREATED_AT = at('2026-03-10', 14);

export const VISA = 1;
export const PRESTAMO = 2;
export const AHORROS = 3;
export const NOMINA = 4;

export const rateRow = (id: number, productId: number, effectiveFrom: string, mv: string) => {
  const { ea } = rateFromMv(mv);
  return make(ProductRate, { id, productId, effectiveFrom, ea, mv: new Decimal(mv), source: 'mv' });
};

export const facts = (overrides: Partial<ProjectionFacts> = {}): ProjectionFacts => ({
  balances: [
    // AHORROS: dos saldos confirmados; manda el último
    make(AccountBalance, {
      id: 1,
      productId: AHORROS,
      asOf: '2026-02-01',
      balanceCents: 999,
      createdAt: at('2026-02-01', 9),
    }),
    // El saldo que fija asOf se confirmó el 10 de marzo a las 2 p. m. (UTC): lo de ese día registrado antes ya está dentro
    make(AccountBalance, {
      id: 2,
      productId: AHORROS,
      asOf: '2026-03-10',
      balanceCents: pesos(2_000_000),
      createdAt: BALANCE_CREATED_AT,
    }),
    // NOMINA: su último saldo es más viejo que el de AHORROS
    make(AccountBalance, {
      id: 3,
      productId: NOMINA,
      asOf: '2026-03-01',
      balanceCents: 0,
      createdAt: at('2026-03-01', 9),
    }),
  ],
  cards: [
    make(CreditCard, {
      productId: VISA,
      creditLimitCents: pesos(5_000_000),
      cutDay: 15,
      dueDay: 5,
      handlingFeeCents: pesos(30_000),
      insuranceCents: 0,
      minPaymentMethod: 'constant_capital',
      singleInstallmentInterestFree: true,
      firstPeriodInterest: 'full_month',
    }),
  ],
  loans: [
    make(Loan, {
      productId: PRESTAMO,
      principalCents: pesos(10_000_000),
      termMonths: 12,
      firstPaymentDate: '2026-02-10',
      fixedPaymentCents: null,
      insuranceCents: pesos(12_000),
      method: 'fixed_installment',
    }),
  ],
  rates: [rateRow(1, VISA, '2025-12-01', '0.02'), rateRow(2, PRESTAMO, '2026-01-01', '0.015')],
  expenses: [
    make(Expense, {
      id: 10,
      date: '2026-01-20',
      amountCents: pesos(1_200_000),
      sourceProductId: VISA,
      installments: 3,
      promoEa: null,
      promoMv: null,
      description: 'Compra A',
    }),
  ],
  capitalPayments: [
    make(CapitalPayment, {
      id: 20,
      productId: VISA,
      date: '2026-03-25',
      amountCents: pesos(200_000),
      mode: 'reduce_term',
      expenseId: null,
    }),
  ],
  recurringIncomes: [
    make(RecurringIncome, {
      id: 30,
      name: 'Salario',
      amountCents: pesos(3_000_000),
      dayOfMonth: 30,
      startDate: '2026-01-01',
      endDate: null,
    }),
  ],
  oneOffIncomes: [],
  fixedExpenses: [
    make(FixedExpense, {
      id: 40,
      name: 'Netflix',
      amountCents: pesos(40_000),
      dayOfMonth: 20,
      startDate: '2026-01-01',
      endDate: null,
      cardId: VISA,
    }),
  ],
  settings: make(Settings, {
    userId: 1,
    yellowBelowIncomePct: new Decimal('0.10'),
    cardUtilizationPct: new Decimal('0.30'),
    debtToIncomePct: new Decimal('0.30'),
    statementTolerancePct: new Decimal('0.02'),
  }),
  ...overrides,
});
