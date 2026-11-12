import { BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CreditCard } from '../products/entities/credit-card.entity';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { Expense } from '../movements/entities/expense.entity';
import { Settings } from '../settings/entities/settings.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import {
  AHORROS,
  BALANCE_CREATED_AT,
  NOMINA,
  VISA,
  at,
  facts,
  make,
  pesos,
  rateRow,
} from '../testing/projection-facts';
import { MAX_BALANCE_AGE_DAYS, type ProjectionFacts, buildProjection as buildAt } from './build-projection';

// Va en apps/api/src/projection/. buildProjection es PURA: recibe las filas que el service ya
// leyó de la base y arma todo para project() del motor. El service solo carga y la llama.
// Es el escenario de "proyección completa con deudas" de debt-events.test.ts del motor, con
// las mismas cifras, pero entrando desde las entidades. Datos ficticios.

// "Hoy" para las pruebas de cifras: dos días después del saldo (2026-03-10), así el saldo está fresco.
// Las pruebas de frescura, más abajo, usan buildAt con otras fechas.
const TODAY = '2026-03-12';
const buildProjection = (f: ProjectionFacts, months: number) => buildAt(f, months, TODAY);

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

describe('buildProjection: alertas', () => {
  const withSettings = (changes: Partial<Settings>, overrides: Partial<ProjectionFacts> = {}) => {
    const base = facts();
    return facts({ settings: make(Settings, { ...base.settings, ...changes }), ...overrides });
  };
  const alertsOf = (f: ProjectionFacts) => buildProjection(f, 3).alerts;

  it('deuda sobre ingreso: abril (1.414.800 de 3.000.000) y mayo (1.202.800) pasan el 30 %; marzo no paga nada', () => {
    expect(alertsOf(facts())).toEqual([
      { kind: 'debt_to_income', refId: '2026-04', value: new Decimal('0.4716'), threshold: new Decimal('0.3') },
      { kind: 'debt_to_income', refId: '2026-05', value: new Decimal('0.4009'), threshold: new Decimal('0.3') },
    ]);
  });

  it('los umbrales salen de settings', () => {
    const only = (f: ProjectionFacts) => alertsOf(f).map((a) => a.refId);
    expect(only(withSettings({ debtToIncomePct: new Decimal('0.45') }))).toEqual(['2026-04']);
    expect(only(withSettings({ debtToIncomePct: new Decimal('0.50') }))).toEqual([]);
  });

  it('sin nada que avisar, alerts es una lista vacía (no trae undefined)', () => {
    const calm = withSettings({ debtToIncomePct: new Decimal('0.9') });
    expect(buildProjection(calm, 3).alerts).toEqual([]);
  });

  it('cupo usado: la VISA usa 840.000 de 5.000.000 (16,8 %) el día del saldo', () => {
    // 800.000 de la compra A que falta pagar + 40.000 del Netflix de febrero, que corta el 15 de marzo
    const alerts = alertsOf(
      withSettings({ cardUtilizationPct: new Decimal('0.10'), debtToIncomePct: new Decimal('0.9') }),
    );
    expect(alerts).toEqual([
      { kind: 'card_utilization', refId: String(VISA), value: new Decimal('0.168'), threshold: new Decimal('0.1') },
    ]);
  });

  it('igualar el umbral no alerta', () => {
    expect(alertsOf(withSettings({ cardUtilizationPct: new Decimal('0.168') })).map((a) => a.kind)).not.toContain(
      'card_utilization',
    );
  });

  it('el cupo usado cuenta los cargos de gastos fijos con tarjeta que ya se hicieron', () => {
    const loose = { cardUtilizationPct: new Decimal('0.165') }; // entre 16 % (sin Netflix) y 16,8 % (con Netflix)
    expect(alertsOf(withSettings(loose)).map((a) => a.kind)).toContain('card_utilization');
    expect(alertsOf(withSettings(loose, { fixedExpenses: [] })).map((a) => a.kind)).not.toContain('card_utilization');
  });

  it('cada tarjeta se mide con sus propias compras: una tarjeta sin compras no avisa', () => {
    const other = make(CreditCard, { ...facts().cards[0], productId: 9 });
    const base = facts();
    const f = withSettings(
      { cardUtilizationPct: new Decimal('0.10') },
      { cards: [...base.cards, other], rates: [...base.rates, rateRow(3, 9, '2025-12-01', '0.03')] },
    );
    const cardAlerts = alertsOf(f).filter((a) => a.kind === 'card_utilization');
    expect(cardAlerts.map((a) => a.refId)).toEqual([String(VISA)]);
  });

  it('en JSON los valores salen como texto, sin perder decimales', () => {
    const json = JSON.parse(JSON.stringify(buildProjection(facts(), 3).alerts)) as unknown;
    expect(json).toEqual([
      { kind: 'debt_to_income', refId: '2026-04', value: '0.4716', threshold: '0.3' },
      { kind: 'debt_to_income', refId: '2026-05', value: '0.4009', threshold: '0.3' },
    ]);
  });
});

describe('buildProjection: lo registrado el mismo día del saldo', () => {
  // El saldo que fija asOf (10 de marzo) se confirmó a las 2 p. m. (BALANCE_CREATED_AT). Lo del mismo día
  // cuenta solo si se registró después de esa hora; antes, ya estaba dentro del saldo.
  const cash = (id: number, date: string, amount: number, createdAt: Date) =>
    make(Expense, {
      id,
      date,
      amountCents: pesos(amount),
      sourceProductId: AHORROS,
      installments: null,
      description: '',
      createdAt,
    });
  const income = (id: number, date: string, amount: number, createdAt: Date) =>
    make(OneOffIncome, { id, date, amountCents: pesos(amount), description: 'Prima', createdAt });

  const base = facts();
  const marchClosing = (f: ProjectionFacts) => buildProjection(f, 3).months[0]?.closingBalance;
  const BASE_CLOSING = pesos(4_800_000);

  it('un gasto del mismo día registrado después del saldo baja el cierre; uno registrado antes, no', () => {
    const after = at('2026-03-10', 15);
    const before = at('2026-03-10', 13);
    expect(marchClosing(facts({ expenses: [...base.expenses, cash(11, '2026-03-10', 100_000, after)] }))).toBe(
      BASE_CLOSING - pesos(100_000),
    );
    expect(marchClosing(facts({ expenses: [...base.expenses, cash(11, '2026-03-10', 100_000, before)] }))).toBe(
      BASE_CLOSING,
    );
  });

  it('un ingreso puntual del mismo día registrado después del saldo sube el cierre; uno antes, no', () => {
    const f = (createdAt: Date) => facts({ oneOffIncomes: [income(50, '2026-03-10', 500_000, createdAt)] });
    expect(marchClosing(f(at('2026-03-10', 15)))).toBe(BASE_CLOSING + pesos(500_000));
    expect(marchClosing(f(at('2026-03-10', 13)))).toBe(BASE_CLOSING);
  });

  it('registrado a la misma hora exacta del saldo no cuenta (la comparación es estricta)', () => {
    const f = facts({ expenses: [...base.expenses, cash(11, '2026-03-10', 100_000, BALANCE_CREATED_AT)] });
    expect(marchClosing(f)).toBe(BASE_CLOSING);
  });

  it('el día anterior no cuenta aunque se haya registrado después; el posterior cuenta siempre', () => {
    const late = at('2026-03-11', 9);
    expect(marchClosing(facts({ expenses: [...base.expenses, cash(11, '2026-03-09', 100_000, late)] }))).toBe(
      BASE_CLOSING,
    );
    // Posterior: cuenta aunque se haya registrado antes del saldo (alguien lo programó con tiempo)
    const early = at('2026-03-01', 9);
    expect(marchClosing(facts({ expenses: [...base.expenses, cash(11, '2026-03-11', 100_000, early)] }))).toBe(
      BASE_CLOSING - pesos(100_000),
    );
  });

  it('si dos cuentas comparten la fecha del saldo, manda la hora del más reciente', () => {
    const balances = [
      make(AccountBalance, {
        id: 1,
        productId: AHORROS,
        asOf: '2026-03-10',
        balanceCents: pesos(1_000_000),
        createdAt: at('2026-03-10', 14),
      }),
      make(AccountBalance, {
        id: 2,
        productId: NOMINA,
        asOf: '2026-03-10',
        balanceCents: pesos(1_000_000),
        createdAt: at('2026-03-10', 16),
      }),
    ];
    // A las 3 p. m.: después del primer saldo pero antes del segundo, que ya lo incluye
    const f = (createdAt: Date) =>
      facts({ balances, expenses: [...base.expenses, cash(11, '2026-03-10', 100_000, createdAt)] });
    expect(marchClosing(f(at('2026-03-10', 15)))).toBe(BASE_CLOSING);
    expect(marchClosing(f(at('2026-03-10', 17)))).toBe(BASE_CLOSING - pesos(100_000));
  });

  it('un gasto con tarjeta no sale del disponible ese día: la marca no lo convierte en salida de caja', () => {
    const onCard = make(Expense, {
      id: 11,
      date: '2026-03-10',
      amountCents: pesos(100_000),
      sourceProductId: VISA,
      installments: 1,
      promoEa: null,
      promoMv: null,
      description: '',
      createdAt: at('2026-03-10', 15),
    });
    const events = buildProjection(facts({ expenses: [...base.expenses, onCard] }), 3).months[0]?.events ?? [];
    expect(events.filter((e) => e.kind === 'expense')).toEqual([]);
  });
});
