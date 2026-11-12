import { BadRequestException, ConflictException } from '@nestjs/common';
import type { MonthSummary } from '@greenlight/engine';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Expense } from '../movements/entities/expense.entity';
import { AHORROS, PRESTAMO, VISA, at, facts, make, pesos, rateRow } from '../testing/projection-facts';
import { buildProjection } from './build-projection';
import { type SimulationCandidate, buildSimulation as buildAt } from './build-simulation';

// Va en apps/api/src/projection/. buildSimulation es PURA, igual que buildProjection: recibe las
// mismas filas (ProjectionFacts) más la compra que estás pensando hacer, y llama a
// compareInstallments() y simulatePurchase() del motor. Datos ficticios.

const TODAY = '2026-03-12';
const buildSimulation = (candidate: SimulationCandidate, months = 3, f = facts()) =>
  buildAt(f, candidate, months, TODAY);

// Un televisor de 1.200.000 a 3 cuotas con la VISA, hoy. Corta el 15 de marzo: la primera
// cuota se paga el 5 de abril
const tv: SimulationCandidate = { cardId: VISA, date: TODAY, amountCents: pesos(1_200_000), installments: 3 };

// Las cifras de cada mes. Los eventos pueden salir en otro orden (el motor agrega al final los de
// la tarjeta simulada), así que se comparan los números, no la lista de eventos
const figures = (months: readonly MonthSummary[]) =>
  months.map(({ month, lowestBalance, lowestBalanceDate, closingBalance, light }) => ({
    month,
    lowestBalance,
    lowestBalanceDate,
    closingBalance,
    light,
  }));

describe('buildSimulation: sin la compra es la misma proyección', () => {
  it('`without` son exactamente los meses de GET /projection', () => {
    expect(figures(buildSimulation(tv).without)).toEqual(figures(buildProjection(facts(), 3, TODAY).months));
  });

  it('devuelve el punto de partida igual que la proyección', () => {
    expect(buildSimulation(tv)).toMatchObject({ asOf: '2026-03-10', daysSinceBalance: 2 });
  });

  it('las otras tarjetas y los préstamos siguen en la proyección de base', () => {
    // Con una segunda tarjeta (cuota de manejo de 30.000 en abril), `without` de la VISA la incluye
    const other = make(CreditCard, { ...facts().cards[0], productId: 9 });
    const withTwo = facts({
      cards: [...facts().cards, other],
      rates: [...facts().rates, rateRow(3, 9, '2025-12-01', '0.03')],
    });
    const result = buildSimulation(tv, 3, withTwo);
    expect(figures(result.without)).toEqual(figures(buildProjection(withTwo, 3, TODAY).months));
    expect(result.without[1]?.closingBalance).toBe(638_520_007 - pesos(30_000));
  });
});

describe('buildSimulation: con la compra', () => {
  const result = buildSimulation(tv);
  const [, apr, may] = result.with;

  it('marzo no cambia: la compra corta el 15 y se paga en abril', () => {
    expect(figures(result.with)[0]).toEqual(figures(result.without)[0]);
  });

  it('abril cierra 424.000 más bajo: primera cuota (400.000 de capital + 24.000 de interés)', () => {
    expect(result.firstPayment).toBe(pesos(424_000));
    expect(apr?.closingBalance).toBe(638_520_007 - pesos(424_000));
  });

  it('mayo acumula la segunda cuota (416.000)', () => {
    expect(may?.closingBalance).toBe(818_240_014 - pesos(424_000 + 416_000));
  });

  it('cuánto cuesta la compra en total', () => {
    expect(result).toMatchObject({
      installments: 3,
      totalInterest: pesos(48_000),
      totalCost: pesos(1_248_000),
    });
    expect(result.rows).toHaveLength(3);
  });

  it('compara los plazos de 1, 3, 6 y 12 cuotas', () => {
    expect(result.options.map((o) => o.installments)).toEqual([1, 3, 6, 12]);
    expect(result.options.map((o) => o.firstPayment)).toEqual([1_200_000, 424_000, 224_000, 124_000].map(pesos));
    // A 1 cuota no paga interés (singleInstallmentInterestFree)
    expect(result.options[0]?.totalInterest).toBe(0);
  });

  it('no modifica las filas que recibe', () => {
    const f = facts();
    buildSimulation(tv, 3, f);
    expect(f.expenses).toHaveLength(1);
  });
});

describe('buildSimulation: cupo', () => {
  it('el cupo libre descuenta la compra A pendiente (800.000) y Netflix de febrero (40.000)', () => {
    expect(buildSimulation(tv).availableCredit).toBe(pesos(5_000_000 - 800_000 - 40_000));
    expect(buildSimulation(tv).exceedsLimit).toBe(false);
  });

  it('si no cabe en el cupo lo avisa, pero igual simula', () => {
    const result = buildSimulation({ ...tv, amountCents: pesos(5_000_000) });
    expect(result.exceedsLimit).toBe(true);
    expect(result.with).toHaveLength(3);
  });

  it('cada tarjeta tiene su propio cupo: la compra A y Netflix son de la VISA', () => {
    const other = make(CreditCard, { ...facts().cards[0], productId: 9 });
    const withTwo = facts({
      cards: [...facts().cards, other],
      rates: [...facts().rates, rateRow(3, 9, '2025-12-01', '0.03')],
    });
    expect(buildSimulation({ ...tv, cardId: 9 }, 3, withTwo).availableCredit).toBe(pesos(5_000_000));
  });
});

describe('buildSimulation: promoción', () => {
  it('con promo al 0 % no paga interés y abril baja solo 400.000', () => {
    const result = buildSimulation({ ...tv, promo: { mv: '0' } });
    expect(result.totalInterest).toBe(0);
    expect(result.with[1]?.closingBalance).toBe(638_520_007 - pesos(400_000));
  });

  it('una promo mal escrita es 400 (la valida resolveRate)', () => {
    expect(() => buildSimulation({ ...tv, promo: { mv: 'dos' } })).toThrow(BadRequestException);
  });
});

describe('buildSimulation: errores', () => {
  it('una tarjeta que no existe es 400', () => {
    expect(() => buildSimulation({ ...tv, cardId: 99 })).toThrow(BadRequestException);
    expect(() => buildSimulation({ ...tv, cardId: 99 })).toThrow(/tarjeta/i);
  });

  it('un préstamo no es una tarjeta: 400', () => {
    expect(() => buildSimulation({ ...tv, cardId: PRESTAMO })).toThrow(BadRequestException);
  });

  it('una compra anterior al saldo es 400: ese saldo ya la tendría contada', () => {
    expect(() => buildSimulation({ ...tv, date: '2026-03-09' })).toThrow(BadRequestException);
    expect(() => buildSimulation({ ...tv, date: '2026-03-09' })).toThrow(/2026-03-10/);
  });

  it('con un saldo de más de 31 días es 409, igual que la proyección', () => {
    expect(() => buildAt(facts(), tv, 3, '2026-04-11')).toThrow(ConflictException);
  });
});

describe('buildSimulation: lo registrado el mismo día del saldo', () => {
  it('el gasto del día del saldo registrado después también baja la proyección de base (without y with)', () => {
    const base = facts();
    const sameDay = make(Expense, {
      id: 11,
      date: '2026-03-10',
      amountCents: pesos(100_000),
      sourceProductId: AHORROS,
      installments: null,
      description: '',
      createdAt: at('2026-03-10', 15), // después del saldo (2 p. m.)
    });
    const withExpense = facts({ expenses: [...base.expenses, sameDay] });

    const plain = buildSimulation(tv).without[0]?.closingBalance;
    const outcome = buildSimulation(tv, 3, withExpense);
    expect(outcome.without[0]?.closingBalance).toBe((plain ?? 0) - pesos(100_000));
    expect(outcome.without[0]?.closingBalance).toBe(buildProjection(withExpense, 3, TODAY).months[0]?.closingBalance);
    // Marzo no cambia con la compra a cuotas (se paga en abril): con y sin la compra parten igual
    expect(outcome.with[0]?.closingBalance).toBe(outcome.without[0]?.closingBalance);
  });
});
