import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Expense } from '../movements/entities/expense.entity';
import { Settings } from '../settings/entities/settings.entity';
import { AHORROS, facts, make, pesos } from '../testing/projection-facts';
import { type StatementCheckInput, type StatementFacts, buildStatementCheck as buildAt } from './build-statement-check';

// Va en apps/api/src/statements/. buildStatementCheck es PURA: recibe la tarjeta y sus filas,
// arma el extracto de un corte con el motor (planCard + statement) y compara el mínimo con el
// del banco (checkStatement). El service busca la tarjeta, la llama y guarda el StatementCheck.
// Datos ficticios: la VISA del fixture (corta el 15, paga el 5, cuota de manejo 30.000).

const TODAY = '2026-04-20';

const visaFacts = (overrides: Partial<StatementFacts> = {}): StatementFacts => {
  const f = facts();
  return {
    card: f.cards[0],
    rates: f.rates,
    expenses: f.expenses,
    capitalPayments: f.capitalPayments,
    fixedExpenses: f.fixedExpenses,
    settings: f.settings,
    ...overrides,
  };
};

const march: StatementCheckInput = { cutDate: '2026-03-15', statementMinimumCents: pesos(480_000) };
const check = (input: Partial<StatementCheckInput> = {}, f = visaFacts(), today = TODAY) =>
  buildAt(f, { ...march, ...input }, today);

describe('buildStatementCheck: el extracto que calcula el motor', () => {
  // Corte de marzo: cuota 2 de la compra A (400.000 + 2 % de 800.000) y Netflix del 20 de febrero
  const { statement } = check();

  it('el pago vence el día 5 del mes siguiente', () => {
    expect(statement.dueDate).toBe('2026-04-05');
  });

  it('trae las cuotas de ese corte: la compra A y el cargo de Netflix', () => {
    expect(statement.lines.map((l) => l.purchaseId)).toEqual(['10', '40@2026-02-20']);
  });

  it('el mínimo es capital + interés + cuota de manejo', () => {
    expect(statement.minimum).toEqual({
      capital: pesos(440_000),
      interest: pesos(16_000),
      fees: pesos(30_000),
      total: pesos(486_000),
    });
  });

  it('el pago total salda lo que falta de la compra A', () => {
    expect(statement.fullPayment.total).toBe(pesos(886_000));
  });

  it('el abono a capital del 25 de marzo baja el mínimo de abril', () => {
    // reduce_term: los 200.000 se comen la última cuota; abril cobra 200.000 + 4.000 + Netflix + manejo
    expect(check({ cutDate: '2026-04-15' }).statement.minimum.total).toBe(pesos(274_000));
  });

  it('solo cuenta las compras de esta tarjeta', () => {
    const base = visaFacts();
    const cash = make(Expense, {
      id: 11,
      date: '2026-03-01',
      amountCents: pesos(500_000),
      sourceProductId: AHORROS,
      installments: null,
      description: '',
    });
    const otherCard = make(Expense, { ...base.expenses[0], id: 12, sourceProductId: 9 });
    const noisy = visaFacts({ expenses: [...base.expenses, cash, otherCard] });
    expect(check({}, noisy).statement.minimum.total).toBe(pesos(486_000));
  });
});

describe('buildStatementCheck: contra el banco', () => {
  it('480.000 del banco contra 486.000 calculados: 1,25 %, dentro del 2 %', () => {
    expect(check().check).toMatchObject({
      calculatedMinimum: pesos(486_000),
      bankMinimum: pesos(480_000),
      difference: pesos(6_000),
      withinTolerance: true,
    });
    expect(check().check.relativeDifference.toString()).toBe('0.0125');
  });

  it('470.000 del banco ya se pasa: 3,4 %', () => {
    expect(check({ statementMinimumCents: pesos(470_000) }).check.withinTolerance).toBe(false);
  });

  it('la tolerancia sale de settings', () => {
    const base = visaFacts();
    const loose = visaFacts({
      settings: make(Settings, { ...base.settings, statementTolerancePct: new Decimal('0.05') }),
    });
    expect(check({ statementMinimumCents: pesos(470_000) }, loose).check.withinTolerance).toBe(true);
  });
});

describe('buildStatementCheck: errores', () => {
  it('una fecha que no es de corte es 400 y sugiere el corte que le toca', () => {
    expect(() => check({ cutDate: '2026-03-14' })).toThrow(BadRequestException);
    expect(() => check({ cutDate: '2026-03-14' })).toThrow(/2026-03-15/);
  });

  it('un corte que todavía no llega es 400', () => {
    expect(() => check({}, visaFacts(), '2026-03-14')).toThrow(BadRequestException);
  });

  it('el día del corte ya se puede validar', () => {
    expect(check({}, visaFacts(), '2026-03-15').check.withinTolerance).toBe(true);
  });

  it('un pago total menor que el mínimo es 400', () => {
    expect(() => check({ statementTotalCents: pesos(400_000) })).toThrow(BadRequestException);
  });

  it('otra tarjeta con otro día de corte valida sus propias fechas', () => {
    const card = make(CreditCard, { ...visaFacts().card, cutDay: 28 });
    expect(() => check({}, visaFacts({ card }))).toThrow(/28/);
  });
});
