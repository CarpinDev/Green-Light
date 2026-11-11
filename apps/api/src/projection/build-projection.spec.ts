import { BadRequestException, ConflictException } from '@nestjs/common';
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
import { MAX_BALANCE_AGE_DAYS, type ProjectionFacts, buildProjection as buildAt } from './build-projection';

// Va en apps/api/src/projection/. buildProjection es PURA: recibe las filas que el service ya
// leyó de la base y arma todo para project() del motor. El service solo carga y la llama.
// Es el escenario de "proyección completa con deudas" de debt-events.test.ts del motor, con
// las mismas cifras, pero entrando desde las entidades. Datos ficticios.

// "Hoy" para las pruebas de cifras: dos días después del saldo (2026-03-10), así el saldo está fresco.
// Las pruebas de frescura, más abajo, usan buildAt con otras fechas.
const TODAY = '2026-03-12';
const buildProjection = (f: ProjectionFacts, months: number) => buildAt(f, months, TODAY);

const make = <T extends object>(Entity: new () => T, fields: Partial<T>): T => Object.assign(new Entity(), fields);
const pesos = (n: number) => n * 100;

const VISA = 1;
const PRESTAMO = 2;
const AHORROS = 3;
const NOMINA = 4;

const rateRow = (id: number, productId: number, effectiveFrom: string, mv: string) => {
  const { ea } = rateFromMv(mv);
  return make(ProductRate, { id, productId, effectiveFrom, ea, mv: new Decimal(mv), source: 'mv' });
};

const facts = (overrides: Partial<ProjectionFacts> = {}): ProjectionFacts => ({
  balances: [
    // AHORROS: dos saldos confirmados; manda el último
    make(AccountBalance, { id: 1, productId: AHORROS, asOf: '2026-02-01', balanceCents: 999 }),
    make(AccountBalance, { id: 2, productId: AHORROS, asOf: '2026-03-10', balanceCents: pesos(2_000_000) }),
    // NOMINA: su último saldo es más viejo que el de AHORROS
    make(AccountBalance, { id: 3, productId: NOMINA, asOf: '2026-03-01', balanceCents: 0 }),
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
    id: 1,
    yellowBelowIncomePct: new Decimal('0.10'),
    cardUtilizationPct: new Decimal('0.30'),
    debtToIncomePct: new Decimal('0.30'),
    statementTolerancePct: new Decimal('0.02'),
  }),
  ...overrides,
});

describe('buildProjection: punto de partida', () => {
  it('suma el último saldo de cada cuenta y parte de la fecha más reciente', () => {
    const result = buildProjection(facts(), 3);
    expect(result.asOf).toBe('2026-03-10');
    expect(result.openingBalanceCents).toBe(pesos(2_000_000));
  });

  it('avisa qué cuentas tienen un saldo más viejo que el punto de partida', () => {
    expect(buildProjection(facts(), 3).staleAccounts).toEqual([NOMINA]);
  });

  it('sin ningún saldo confirmado no hay de dónde partir: 400', () => {
    expect(() => buildProjection(facts({ balances: [] }), 3)).toThrow(BadRequestException);
    expect(() => buildProjection(facts({ balances: [] }), 3)).toThrow(/saldo/i);
  });
});

describe('buildProjection: las mismas cifras que el motor', () => {
  const { months } = buildProjection(facts(), 3);
  const [mar, apr, may] = months;

  it('proyecta los meses pedidos desde el mes del saldo', () => {
    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('marzo: el abono a la tarjeta baja el saldo a 1.800.000 y cierra en 4.800.000', () => {
    expect(mar?.lowestBalance).toBe(pesos(1_800_000));
    expect(mar?.lowestBalanceDate).toBe('2026-03-25');
    expect(mar?.closingBalance).toBe(pesos(4_800_000));
  });

  it('abril: mínimo de la tarjeta y cuota del préstamo antes del salario', () => {
    expect(apr?.lowestBalance).toBe(338_520_007);
    expect(apr?.lowestBalanceDate).toBe('2026-04-10');
    expect(apr?.closingBalance).toBe(638_520_007);
  });

  it('mayo cierra en verde', () => {
    expect(may?.closingBalance).toBe(818_240_014);
    expect(may?.light).toBe('green');
  });

  it('Netflix con tarjeta no sale del disponible el día 20: llega en el pago de la tarjeta', () => {
    expect(apr?.events.some((e) => e.date === '2026-04-20')).toBe(false);
  });
});

describe('buildProjection: cómo reparte los datos', () => {
  it('un gasto desde una cuenta sale del disponible ese día; uno anterior al saldo ya está contado', () => {
    const cash = (id: number, date: string, amount: number) =>
      make(Expense, {
        id,
        date,
        amountCents: pesos(amount),
        sourceProductId: AHORROS,
        installments: null,
        description: '',
      });
    const base = facts();
    const { months } = buildProjection(
      facts({ expenses: [...base.expenses, cash(11, '2026-03-05', 999_999), cash(12, '2026-03-15', 100_000)] }),
      3,
    );
    expect(months[0]?.closingBalance).toBe(pesos(4_700_000));
  });

  it('el umbral del amarillo sale de settings', () => {
    // Un gasto de 4.000.000 el 31 de marzo deja marzo en 800.000 con 3.000.000 de ingreso:
    // verde con el 10 % (umbral 300.000), amarillo con el 30 % (umbral 900.000)
    const base = facts();
    const big = make(Expense, {
      id: 13,
      date: '2026-03-31',
      amountCents: pesos(4_000_000),
      sourceProductId: AHORROS,
      installments: null,
      description: '',
    });
    const withBig = facts({ expenses: [...base.expenses, big] });
    expect(buildProjection(withBig, 1).months[0]?.closingBalance).toBe(pesos(800_000));
    expect(buildProjection(withBig, 1).months[0]?.light).toBe('green');
    const strict = {
      ...withBig,
      settings: make(Settings, { ...base.settings, yellowBelowIncomePct: new Decimal('0.30') }),
    };
    expect(buildProjection(strict, 1).months[0]?.light).toBe('yellow');
  });

  it('cada tarjeta y cada préstamo recibe solo sus tasas, compras y abonos', () => {
    // Una segunda tarjeta sin compras no debe recibir la compra A ni el abono de VISA
    const other = make(CreditCard, { ...facts().cards[0], productId: 9 });
    const withTwo = facts({
      cards: [...facts().cards, other],
      rates: [...facts().rates, rateRow(3, 9, '2025-12-01', '0.03')],
    });
    // Solo le cobra a ABRIL su cuota de manejo (30.000 del corte de marzo), nada de la compra A
    expect(buildProjection(withTwo, 3).months[1]?.closingBalance).toBe(638_520_007 - pesos(30_000));
  });
});

describe('buildProjection: frescura del saldo', () => {
  // El saldo más reciente es del 2026-03-10; el de NOMINA (2026-03-01) es más viejo
  const at = (today: string) => () => buildAt(facts(), 3, today);

  it('daysSinceBalance son los días entre el saldo más reciente y hoy', () => {
    expect(buildAt(facts(), 3, '2026-03-12').daysSinceBalance).toBe(2);
    expect(buildAt(facts(), 3, '2026-03-10').daysSinceBalance).toBe(0);
  });

  it('un saldo con fecha de hoy o futura cuenta 0 días, no un número negativo', () => {
    expect(buildAt(facts(), 3, '2026-03-01').daysSinceBalance).toBe(0);
  });

  it('hasta 31 días todavía proyecta: la app solo muestra el aviso', () => {
    expect(MAX_BALANCE_AGE_DAYS).toBe(31);
    const result = buildAt(facts(), 3, '2026-04-10'); // 31 días después del 2026-03-10
    expect(result.daysSinceBalance).toBe(31);
    expect(result.months).toHaveLength(3);
  });

  it('con más de 31 días responde 409 con la fecha del saldo', () => {
    expect(at('2026-04-11')).toThrow(ConflictException); // 32 días
    expect(at('2026-04-11')).toThrow(/2026-03-10/);
    expect(at('2026-04-11')).toThrow(/confírmalo/i);
  });

  it('el límite mira el saldo más reciente de todos, no el de la cuenta más vieja', () => {
    // NOMINA tiene 35 días el 2026-04-05, pero AHORROS (2026-03-10) tiene 26: sí proyecta
    expect(at('2026-04-05')()).toMatchObject({ daysSinceBalance: 26, staleAccounts: [NOMINA] });
  });

  it('cuando hay un saldo más nuevo, el viejo deja de ser el punto de partida', () => {
    const base = facts();
    const fresh = make(AccountBalance, {
      id: 9,
      productId: AHORROS,
      asOf: '2026-04-20',
      balanceCents: pesos(1_000_000),
    });
    const result = buildAt(facts({ balances: [...base.balances, fresh] }), 3, '2026-04-25');
    expect(result).toMatchObject({ asOf: '2026-04-20', daysSinceBalance: 5 });
  });
});
