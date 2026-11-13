import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { StatementCheck } from '../products/entities/statement-check.entity';
import { Settings } from '../settings/entities/settings.entity';
import { FakeDb } from '../testing/fake-db';
import { VISA, facts, pesos } from '../testing/projection-facts';
import { StatementChecksService } from './statement-checks.service';
import { OTHER_USER, USER } from '../testing/users';

// El service busca la tarjeta y sus filas, llama a buildStatementCheck (probada aparte) y guarda
// un StatementCheck. Aquí se prueba lo que es suyo: qué lee, qué guarda y los errores de la base.
// Datos ficticios: la VISA del fixture. Los cortes de marzo de 2026 ya pasaron, sea cual sea "hoy".

const request = { cardId: VISA, cutDate: '2026-03-15', statementMinimumCents: pesos(480_000) };

describe('StatementChecksService.create', () => {
  let db: FakeDb;
  let service: StatementChecksService;

  beforeEach(() => {
    const f = facts();
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Visa', bank: 'Banco Ejemplo', last4: '1111', active: true },
      { id: 99, kind: 'account', name: 'Ahorros', bank: 'Banco Ejemplo', last4: '9999', active: true },
    ]);
    db.seed(CreditCard, f.cards);
    db.seed(ProductRate, f.rates);
    db.seed(Expense, f.expenses);
    db.seed(CapitalPayment, f.capitalPayments);
    db.seed(FixedExpense, f.fixedExpenses);
    db.seed(Settings, [f.settings]);
    db.unique.set(StatementCheck, [['productId', 'cutDate']]);
    service = new StatementChecksService(db.dataSource());
  });

  it('guarda el resultado y devuelve el id con el extracto y la comparación', async () => {
    const result = await service.create(USER, { ...request, statementTotalCents: pesos(900_000) });

    expect(db.rows(StatementCheck)).toHaveLength(1);
    expect(db.rows(StatementCheck)[0]).toMatchObject({
      id: result.id,
      productId: VISA,
      cutDate: '2026-03-15',
      dueDate: '2026-04-05',
      statementMinimumCents: pesos(480_000),
      statementTotalCents: pesos(900_000),
      calculatedMinimumCents: pesos(486_000),
      withinTolerance: true,
    });
    expect(result.statement.minimum.total).toBe(pesos(486_000));
    expect(result.check.withinTolerance).toBe(true);
  });

  it('sin pago total guarda null', async () => {
    await service.create(USER, request);
    expect(db.rows(StatementCheck)[0]?.statementTotalCents).toBeNull();
  });

  it('un mínimo que no cuadra se guarda igual, con withinTolerance en false', async () => {
    const result = await service.create(USER, { ...request, statementMinimumCents: pesos(470_000) });
    expect(result.check.withinTolerance).toBe(false);
    expect(db.rows(StatementCheck)[0]).toMatchObject({
      calculatedMinimumCents: pesos(486_000),
      withinTolerance: false,
    });
  });

  it('validar el mismo corte dos veces es 409 y no duplica el registro', async () => {
    await service.create(USER, request);
    await expect(service.create(USER, request)).rejects.toThrow(ConflictException);
    await expect(service.create(USER, request)).rejects.toThrow(/2026-03-15/);
    expect(db.rows(StatementCheck)).toHaveLength(1);
  });

  it('otro corte de la misma tarjeta sí se puede guardar', async () => {
    await service.create(USER, request);
    await service.create(USER, { ...request, cutDate: '2026-04-15', statementMinimumCents: pesos(274_000) });
    expect(db.rows(StatementCheck)).toHaveLength(2);
  });

  it('un producto tuyo que no es una tarjeta es 400 y no guarda nada', async () => {
    await expect(service.create(USER, { ...request, cardId: 99 })).rejects.toThrow(BadRequestException);
    await expect(service.create(USER, { ...request, cardId: 99 })).rejects.toThrow(/tarjeta/i);
    expect(db.rows(StatementCheck)).toHaveLength(0);
  });

  it('una tarjeta que no existe es 404 y no guarda nada', async () => {
    await expect(service.create(USER, { ...request, cardId: 12345 })).rejects.toThrow(NotFoundException);
    expect(db.rows(StatementCheck)).toHaveLength(0);
  });

  it('la tarjeta de otra persona es 404, igual que una que no existe, y no guarda nada', async () => {
    await expect(service.create(OTHER_USER, request)).rejects.toThrow(NotFoundException);
    expect(db.rows(StatementCheck)).toHaveLength(0);
  });

  it('una fecha que no es de corte es 400 y no guarda nada', async () => {
    await expect(service.create(USER, { ...request, cutDate: '2026-03-14' })).rejects.toThrow(/2026-03-15/);
    expect(db.rows(StatementCheck)).toHaveLength(0);
  });

  it('una falla de la base que no es de unicidad se propaga', async () => {
    db.failOn = StatementCheck;
    await expect(service.create(USER, request)).rejects.toThrow('la base se cayó');
  });
});
