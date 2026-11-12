import type { MonthSummary } from '@greenlight/engine';
import { Expense } from '../movements/entities/expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { AHORROS, VISA, at, facts, make, pesos } from '../testing/projection-facts';
import { buildProjection } from './build-projection';
import { currentBalance } from './current-balance';

// El saldo de hoy: el saldo confirmado más lo que ya pasó. Datos ficticios (el saldo es de $2.000.000 el 10 de marzo).

const month = (events: { date: string; amount: number }[]): MonthSummary =>
  ({ events: events.map((e) => ({ ...e, kind: 'income', label: '', refId: '' })) }) as unknown as MonthSummary;

describe('currentBalance (la función pura)', () => {
  it('sin eventos, el saldo confirmado', () => {
    expect(currentBalance(500, [], '2026-03-12')).toBe(500);
    expect(currentBalance(500, [month([])], '2026-03-12')).toBe(500);
  });

  it('suma lo que tiene fecha de hoy o anterior, en todos los meses, y deja lo futuro', () => {
    const months = [
      month([
        { date: '2026-03-11', amount: -100 },
        { date: '2026-03-12', amount: -50 }, // hoy cuenta
        { date: '2026-03-13', amount: 1000 }, // mañana no
      ]),
      month([{ date: '2026-04-01', amount: 7 }]),
    ];
    expect(currentBalance(500, months, '2026-03-12')).toBe(350);
    expect(currentBalance(500, months, '2026-04-01')).toBe(1357);
  });
});

describe('buildProjection: currentBalanceCents y today', () => {
  // Sin tarjetas, préstamos ni fijos: solo el saldo y lo que cada prueba agrega
  const bare = (overrides: Parameters<typeof facts>[0] = {}) =>
    facts({
      expenses: [],
      capitalPayments: [],
      recurringIncomes: [],
      fixedExpenses: [],
      cards: [],
      loans: [],
      rates: [],
      ...overrides,
    });
  const at12 = (f: ReturnType<typeof facts>, today = '2026-03-12') => buildProjection(f, 3, today);
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

  it('sin movimientos da el saldo confirmado (y devuelve la fecha de hoy)', () => {
    const result = at12(bare());
    expect(result.currentBalanceCents).toBe(pesos(2_000_000));
    expect(result.currentBalanceCents).toBe(result.openingBalanceCents);
    expect(result.today).toBe('2026-03-12');
  });

  it('un gasto de hoy lo baja', () => {
    const f = bare({ expenses: [cash(1, '2026-03-12', 30_000, at('2026-03-12', 9))] });
    expect(at12(f).currentBalanceCents).toBe(pesos(1_970_000));
  });

  it('un ingreso futuro no cuenta; el día que llega, sí', () => {
    const f = bare({
      oneOffIncomes: [
        make(OneOffIncome, { id: 1, date: '2026-03-20', amountCents: pesos(500_000), createdAt: at('2026-03-11', 9) }),
      ],
    });
    expect(at12(f).currentBalanceCents).toBe(pesos(2_000_000));
    expect(at12(f, '2026-03-20').currentBalanceCents).toBe(pesos(2_500_000));
  });

  it('un gasto con tarjeta no cuenta hasta el día del pago del extracto', () => {
    // Visa: corte el 15 y pago el 5. Una compra del 11 de marzo se paga el 5 de abril
    const base = facts({ capitalPayments: [], recurringIncomes: [], fixedExpenses: [], loans: [], expenses: [] });
    const withPurchase = facts({
      ...base,
      expenses: [
        make(Expense, {
          id: 5,
          date: '2026-03-11',
          amountCents: pesos(600_000),
          sourceProductId: VISA,
          installments: 1,
          promoEa: null,
          promoMv: null,
          description: '',
          createdAt: at('2026-03-11', 9),
        }),
      ],
    });
    expect(at12(withPurchase).currentBalanceCents).toBe(at12(base).currentBalanceCents);
    // El 6 de abril ya se pagó: el saldo baja por esa compra
    expect(at12(withPurchase, '2026-04-06').currentBalanceCents).toBeLessThan(
      at12(base, '2026-04-06').currentBalanceCents,
    );
  });

  it('lo de hoy registrado antes de confirmar el saldo no cuenta; registrado después, sí', () => {
    // El saldo se confirmó el 10 de marzo a las 2 p. m. (UTC)
    const before = bare({ expenses: [cash(1, '2026-03-10', 100_000, at('2026-03-10', 13))] });
    const after = bare({ expenses: [cash(1, '2026-03-10', 100_000, at('2026-03-10', 15))] });
    expect(at12(before).currentBalanceCents).toBe(pesos(2_000_000));
    expect(at12(after).currentBalanceCents).toBe(pesos(1_900_000));
  });
});
