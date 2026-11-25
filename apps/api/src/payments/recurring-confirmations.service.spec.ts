import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { Account } from '../products/entities/account.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { OTHER_USER, USER } from '../testing/users';
import { RecurringConfirmation } from './entities/recurring-confirmation.entity';
import { RecurringConfirmationsService } from './recurring-confirmations.service';

// Confirmar que llegó un salario o se pagó un gasto fijo. Las fechas esperadas salen de monthlyDates, la misma
// regla de la proyección. Datos ficticios.

const AHORROS = 4;
const VISA = 1;
const SALARIO = 30;
const ARRIENDO = 40;
const NETFLIX = 41;
const TODAY = '2026-03-20';

describe('RecurringConfirmationsService', () => {
  let db: FakeDb;
  let service: RecurringConfirmationsService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', last4: '1357', active: true },
    ]);
    db.seed(Account, [{ productId: AHORROS, accountType: 'savings' }]);
    db.seed(RecurringIncome, [
      {
        id: SALARIO,
        name: 'Salario',
        amountCents: 300_000_000,
        dayOfMonth: 15,
        startDate: '2026-01-01',
        endDate: null,
      },
    ]);
    db.seed(FixedExpense, [
      {
        id: ARRIENDO,
        name: 'Arriendo',
        amountCents: 100_000_000,
        dayOfMonth: 5,
        startDate: '2026-01-01',
        endDate: null,
        cardId: null,
      },
      {
        id: NETFLIX,
        name: 'Netflix',
        amountCents: 4_000_000,
        dayOfMonth: 20,
        startDate: '2026-01-01',
        endDate: null,
        cardId: VISA,
      },
    ]);
    service = new RecurringConfirmationsService(db.dataSource());
  });

  const salary = {
    recurringIncomeId: SALARIO,
    scheduledDate: '2026-03-15',
    actualDate: '2026-03-13',
    amountCents: 280_000_000,
  };

  it('confirma el salario con otra fecha, otro monto y la cuenta donde llegó', async () => {
    await service.create(USER, { ...salary, accountId: AHORROS }, TODAY);
    expect(db.rows(RecurringConfirmation)[0]).toMatchObject({
      userId: USER,
      recurringIncomeId: SALARIO,
      scheduledDate: '2026-03-15',
      actualDate: '2026-03-13',
      amountCents: 280_000_000,
      accountId: AHORROS,
    });
  });

  it('confirma el arriendo (gasto fijo desde una cuenta)', async () => {
    await service.create(
      USER,
      { fixedExpenseId: ARRIENDO, scheduledDate: '2026-03-05', actualDate: '2026-03-06', amountCents: 105_000_000 },
      TODAY,
    );
    expect(db.rows(RecurringConfirmation)[0]).toMatchObject({ fixedExpenseId: ARRIENDO, amountCents: 105_000_000 });
  });

  it('una fecha que no es de ese ingreso es 400 (el salario es el 15)', async () => {
    await expect(service.create(USER, { ...salary, scheduledDate: '2026-03-16' }, TODAY)).rejects.toThrow(
      /no es una fecha/,
    );
  });

  it('antes de que empiece o después de que termine también es 400', async () => {
    await expect(service.create(USER, { ...salary, scheduledDate: '2025-12-15' }, TODAY)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('un gasto fijo con tarjeta no se confirma: 400', async () => {
    await expect(
      service.create(
        USER,
        { fixedExpenseId: NETFLIX, scheduledDate: '2026-03-20', actualDate: '2026-03-20', amountCents: 4_000_000 },
        TODAY,
      ),
    ).rejects.toThrow(/extracto de la tarjeta/);
  });

  it('una fecha real futura es 400', async () => {
    await expect(service.create(USER, { ...salary, actualDate: '2026-03-21' }, TODAY)).rejects.toThrow(
      /todavía no llega/,
    );
  });

  it('exige uno de los dos, no ninguno ni los dos', async () => {
    const none = { ...salary, recurringIncomeId: undefined };
    await expect(service.create(USER, none, TODAY)).rejects.toThrow(BadRequestException);
    await expect(service.create(USER, { ...salary, fixedExpenseId: ARRIENDO }, TODAY)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('la misma fecha dos veces es 409; otra fecha del mismo ingreso sí', async () => {
    await service.create(USER, salary, TODAY);
    await expect(service.create(USER, salary, TODAY)).rejects.toThrow(ConflictException);
    await expect(
      service.create(USER, { ...salary, scheduledDate: '2026-02-15', actualDate: '2026-02-15' }, TODAY),
    ).resolves.toBeDefined();
  });

  it('el ingreso de otra persona es 404; una cuenta que no existe es 404', async () => {
    await expect(service.create(OTHER_USER, salary, TODAY)).rejects.toThrow(NotFoundException);
    await expect(service.create(USER, { ...salary, accountId: 99 }, TODAY)).rejects.toThrow(NotFoundException);
    expect(db.rows(RecurringConfirmation)).toHaveLength(0);
  });

  it('remove: borra la confirmación; la de otra persona o inexistente es 404', async () => {
    const { id } = await service.create(USER, salary, TODAY);
    await expect(service.remove(OTHER_USER, id)).rejects.toThrow(NotFoundException);
    await service.remove(USER, id);
    expect(db.rows(RecurringConfirmation)).toHaveLength(0);
    await expect(service.remove(USER, id)).rejects.toThrow(NotFoundException);
  });
});
