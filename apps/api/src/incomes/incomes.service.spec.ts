import { BadRequestException } from '@nestjs/common';
import { Category } from '../movements/entities/category.entity';
import { Account } from '../products/entities/account.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { FixedExpense } from './entities/fixed-expense.entity';
import { OneOffIncome } from './entities/one-off-income.entity';
import { RecurringIncome } from './entities/recurring-income.entity';
import { IncomesService } from './incomes.service';

// Reglas de ingresos y gastos fijos. Datos ficticios.

const VISA = 1;
const AHORROS = 2;
const PRESTAMO = 3;
const CERRADA = 4;
const MERCADO = 10; // gasto
const SALARIO = 11; // ingreso

describe('IncomesService', () => {
  let db: FakeDb;
  let service: IncomesService;

  beforeEach(() => {
    db = new FakeDb();
    db.withoutId.add(Account);
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', active: true },
      { id: AHORROS, kind: 'account', active: true },
      { id: PRESTAMO, kind: 'loan', active: true },
      { id: CERRADA, kind: 'credit_card', active: false },
    ]);
    db.seed(Account, [{ productId: AHORROS, accountType: 'savings' }]);
    db.seed(Category, [
      { id: MERCADO, name: 'Mercado', kind: 'expense' },
      { id: SALARIO, name: 'Salario', kind: 'income' },
    ]);
    service = new IncomesService(db.dataSource());
  });

  describe('createRecurringIncome', () => {
    const salary = { name: 'Salario', amountCents: 300_000_000, dayOfMonth: 30, startDate: '2026-01-01' };

    it('guarda el ingreso y devuelve el id', async () => {
      const { id } = await service.createRecurringIncome({ ...salary, destinationAccountId: AHORROS });
      expect(db.rows(RecurringIncome)[0]).toMatchObject({ id, ...salary, destinationAccountId: AHORROS });
    });

    it('sin fin ni cuenta no escribe esos campos', async () => {
      await service.createRecurringIncome(salary);
      const [saved] = db.rows(RecurringIncome);
      expect(saved?.endDate).toBeUndefined();
      expect(saved?.destinationAccountId).toBeUndefined();
    });

    it('un fin igual al inicio es válido; anterior al inicio es 400', async () => {
      await expect(service.createRecurringIncome({ ...salary, endDate: '2026-01-01' })).resolves.toBeDefined();
      await expect(service.createRecurringIncome({ ...salary, endDate: '2025-12-31' })).rejects.toThrow(
        BadRequestException,
      );
      expect(db.rows(RecurringIncome)).toHaveLength(1);
    });

    it('la cuenta de destino debe existir en Account: una tarjeta o un id inexistente es 400', async () => {
      await expect(service.createRecurringIncome({ ...salary, destinationAccountId: VISA })).rejects.toThrow(/cuenta/i);
      await expect(service.createRecurringIncome({ ...salary, destinationAccountId: 999 })).rejects.toThrow(/999/);
      expect(db.rows(RecurringIncome)).toHaveLength(0);
    });
  });

  describe('createOneOffIncome', () => {
    const bonus = { date: '2026-06-20', amountCents: 50_000_000 };

    it('guarda el ingreso con su categoría de ingreso y su cuenta', async () => {
      await service.createOneOffIncome({ ...bonus, description: 'Prima', categoryId: SALARIO, destinationAccountId: AHORROS });
      expect(db.rows(OneOffIncome)[0]).toMatchObject({ description: 'Prima', categoryId: SALARIO, destinationAccountId: AHORROS });
    });

    it('con una categoría de gasto: 400 (la regla inversa de la de gastos)', async () => {
      await expect(service.createOneOffIncome({ ...bonus, categoryId: MERCADO })).rejects.toThrow(/categor/i);
      expect(db.rows(OneOffIncome)).toHaveLength(0);
    });

    it('con una categoría inexistente o una cuenta inexistente: 400', async () => {
      await expect(service.createOneOffIncome({ ...bonus, categoryId: 999 })).rejects.toThrow(/999/);
      await expect(service.createOneOffIncome({ ...bonus, destinationAccountId: 999 })).rejects.toThrow(/999/);
      expect(db.rows(OneOffIncome)).toHaveLength(0);
    });
  });

  describe('createFixedExpense', () => {
    const rent = { name: 'Arriendo', amountCents: 120_000_000, dayOfMonth: 1, startDate: '2026-01-01' };

    it('sin tarjeta: sale del disponible y no escribe cardId', async () => {
      await service.createFixedExpense({ ...rent, categoryId: MERCADO });
      const [saved] = db.rows(FixedExpense);
      expect(saved).toMatchObject({ ...rent, categoryId: MERCADO });
      expect(saved?.cardId).toBeUndefined();
    });

    it('con una tarjeta activa', async () => {
      await service.createFixedExpense({ ...rent, name: 'Netflix', cardId: VISA });
      expect(db.rows(FixedExpense)[0]).toMatchObject({ cardId: VISA });
    });

    it('con una tarjeta desactivada, un préstamo, una cuenta o un id inexistente: 400', async () => {
      for (const cardId of [CERRADA, PRESTAMO, AHORROS, 999]) {
        await expect(service.createFixedExpense({ ...rent, cardId })).rejects.toThrow(BadRequestException);
      }
      expect(db.rows(FixedExpense)).toHaveLength(0);
    });

    it('un fin anterior al inicio: 400', async () => {
      await expect(service.createFixedExpense({ ...rent, endDate: '2025-12-31' })).rejects.toThrow(BadRequestException);
      expect(db.rows(FixedExpense)).toHaveLength(0);
    });

    it('con una categoría de ingreso: 400', async () => {
      await expect(service.createFixedExpense({ ...rent, categoryId: SALARIO })).rejects.toThrow(/categor/i);
    });
  });
});
