import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FakeDb } from '../testing/fake-db';
import { Product } from '../products/entities/product.entity';
import { Category } from './entities/category.entity';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesService, type CreateExpenseInput } from './expenses.service';
import { OTHER_USER, USER } from '../testing/users';

// Las reglas que en SQLite eran un trigger y en Postgres no caben en un CHECK porque cruzan
// tablas: dependen del tipo del producto de origen.
// El service usa this.dataSource.getRepository(Entidad) con findOneBy({ id }) y save(datos).
// Datos ficticios.

const VISA = 1;
const AHORROS = 2;
const PRESTAMO = 3;
const CERRADA = 4;
const MERCADO = 10;
const SALARIO = 11;

const input = (overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput => ({
  date: '2026-03-12',
  amountCents: 20_000_000,
  sourceProductId: AHORROS,
  ...overrides,
});

describe('ExpensesService.create', () => {
  let db: FakeDb;
  let service: ExpensesService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', active: true },
      { id: AHORROS, kind: 'account', active: true },
      { id: PRESTAMO, kind: 'loan', active: true },
      { id: CERRADA, kind: 'credit_card', active: false },
    ]);
    db.seed(Category, [
      { id: MERCADO, name: 'Mercado', kind: 'expense' },
      { id: SALARIO, name: 'Salario', kind: 'income' },
    ]);
    service = new ExpensesService(db.dataSource());
  });

  const rejects = async (overrides: Partial<CreateExpenseInput>, message: RegExp) => {
    await expect(service.create(USER, input(overrides))).rejects.toThrow(BadRequestException);
    await expect(service.create(USER, input(overrides))).rejects.toThrow(message);
    expect(db.rows(Expense)).toHaveLength(0);
  };

  describe('desde una cuenta', () => {
    it('se guarda sin cuotas ni promoción y devuelve el id', async () => {
      const { id } = await service.create(USER, input({ description: 'Mercado', categoryId: MERCADO }));
      const [saved] = db.rows(Expense);
      expect(saved).toMatchObject({
        id,
        date: '2026-03-12',
        amountCents: 20_000_000,
        sourceProductId: AHORROS,
        categoryId: MERCADO,
        description: 'Mercado',
      });
      expect(saved?.installments ?? null).toBeNull();
      expect(saved?.promoEa ?? null).toBeNull();
    });

    it('con cuotas: 400 (una cuenta no difiere a cuotas)', () => rejects({ installments: 3 }, /cuotas/i));

    it('con promoción: 400', () => rejects({ promo: { ea: '0' } }, /promoci/i));

    it('marcado como deuda inicial: 400 (solo aplica a tarjetas)', () => rejects({ isOpeningDebt: true }, /deuda/i));
  });

  describe('desde una tarjeta', () => {
    it('se guarda con sus cuotas', async () => {
      await service.create(USER, input({ sourceProductId: VISA, installments: 12 }));
      expect(db.rows(Expense)[0]).toMatchObject({ sourceProductId: VISA, installments: 12 });
    });

    it('sin cuotas: 400 (la tarjeta necesita saber a cuántas)', () => rejects({ sourceProductId: VISA }, /cuotas/i));

    it('con promoción al 0 %: guarda E.A. y M.V. resueltas y la descripción', async () => {
      await service.create(
        USER,
        input({ sourceProductId: VISA, installments: 12, promo: { ea: '0', description: '12 cuotas sin interés' } }),
      );
      const [saved] = db.rows(Expense);
      expect((saved?.promoEa as Decimal).isZero()).toBe(true);
      expect((saved?.promoMv as Decimal).isZero()).toBe(true);
      expect(saved?.promoDescription).toBe('12 cuotas sin interés');
    });

    it('la tasa de la promoción pasa por las mismas reglas que cualquier tasa', () =>
      rejects({ sourceProductId: VISA, installments: 12, promo: { ea: '0.2899', mv: '0.0241' } }, /no corresponde/i));

    it('puede ser deuda inicial', async () => {
      await service.create(USER, input({ sourceProductId: VISA, installments: 8, isOpeningDebt: true }));
      expect(db.rows(Expense)[0]).toMatchObject({ isOpeningDebt: true });
    });
  });

  describe('origen inválido', () => {
    it('desde un préstamo: 400', () => rejects({ sourceProductId: PRESTAMO }, /préstamo/i));

    it('un producto que no existe: 404 con el id', async () => {
      await expect(service.create(USER, input({ sourceProductId: 999 }))).rejects.toThrow(NotFoundException);
      await expect(service.create(USER, input({ sourceProductId: 999 }))).rejects.toThrow(/999/);
      expect(db.rows(Expense)).toHaveLength(0);
    });

    it('un producto desactivado: 400', () => rejects({ sourceProductId: CERRADA, installments: 1 }, /activ/i));
  });

  describe('categoría', () => {
    it('que no existe: 400', () => rejects({ categoryId: 999 }, /categor/i));

    it('de ingreso en un gasto: 400', () => rejects({ categoryId: SALARIO }, /categor/i));
  });
});

describe('ExpensesService.remove y update', () => {
  let db: FakeDb;
  let service: ExpensesService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', active: true },
      { id: AHORROS, kind: 'account', active: true },
    ]);
    service = new ExpensesService(db.dataSource());
  });

  const seedExpense = (overrides: Partial<Expense> = {}) =>
    db.seed(Expense, [
      { id: 1, userId: USER, sourceProductId: VISA, installments: 3, isOpeningDebt: false, ...overrides },
    ]);

  describe('remove', () => {
    it('borra el propio', async () => {
      seedExpense();
      await service.remove(USER, 1);
      expect(db.rows(Expense)).toHaveLength(0);
    });

    it('el de otra persona: 404 y no se borra', async () => {
      seedExpense({ userId: OTHER_USER });
      await expect(service.remove(USER, 1)).rejects.toThrow(NotFoundException);
      expect(db.rows(Expense)).toHaveLength(1);
    });

    it('uno que no existe: 404', async () => {
      await expect(service.remove(USER, 99)).rejects.toThrow(NotFoundException);
    });

    it('la deuda inicial: 400, se corrige desde la tarjeta', async () => {
      seedExpense({ isOpeningDebt: true });
      await expect(service.remove(USER, 1)).rejects.toThrow(BadRequestException);
      expect(db.rows(Expense)).toHaveLength(1);
    });

    it('con abonos hacia esa compra: 409 y no se borra', async () => {
      seedExpense();
      db.seed(CapitalPayment, [{ id: 5, userId: USER, productId: VISA, expenseId: 1 }]);
      await expect(service.remove(USER, 1)).rejects.toThrow(ConflictException);
      expect(db.rows(Expense)).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('agrega una promoción al 0 % con su descripción', async () => {
      seedExpense();
      await service.update(USER, 1, { promo: { ea: '0', description: 'Primera compra 0 %' } });
      const [saved] = db.rows(Expense);
      expect((saved?.promoEa as Decimal).isZero()).toBe(true);
      expect((saved?.promoMv as Decimal).isZero()).toBe(true);
      expect(saved?.promoDescription).toBe('Primera compra 0 %');
      expect(saved?.installments).toBe(3);
    });

    it('cambia las cuotas sin tocar la promoción', async () => {
      seedExpense({ promoEa: new Decimal(0), promoMv: new Decimal(0) });
      await service.update(USER, 1, { installments: 12 });
      expect(db.rows(Expense)[0]).toMatchObject({ installments: 12 });
      expect((db.rows(Expense)[0]?.promoEa as Decimal).isZero()).toBe(true);
    });

    it('promo: null quita la promoción', async () => {
      seedExpense({ promoEa: new Decimal(0), promoMv: new Decimal(0), promoDescription: 'x' });
      await service.update(USER, 1, { promo: null });
      expect(db.rows(Expense)[0]).toMatchObject({ promoEa: null, promoMv: null, promoDescription: '' });
    });

    it('una tasa mala: 400 y no cambia nada', async () => {
      seedExpense();
      await expect(service.update(USER, 1, { installments: 6, promo: { ea: '-0.1' } })).rejects.toThrow(
        BadRequestException,
      );
      expect(db.rows(Expense)[0]).toMatchObject({ installments: 3 });
    });

    it('el de otra persona: 404', async () => {
      seedExpense({ userId: OTHER_USER });
      await expect(service.update(USER, 1, { promo: { ea: '0' } })).rejects.toThrow(NotFoundException);
    });

    it('un gasto de cuenta (sin cuotas): 400', async () => {
      seedExpense({ sourceProductId: AHORROS, installments: null });
      await expect(service.update(USER, 1, { promo: { ea: '0' } })).rejects.toThrow(BadRequestException);
    });

    it('la deuda inicial: 400', async () => {
      seedExpense({ isOpeningDebt: true });
      await expect(service.update(USER, 1, { installments: 6 })).rejects.toThrow(BadRequestException);
    });
  });
});
