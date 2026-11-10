import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FakeDb } from '../testing/fake-db';
import { Product } from '../products/entities/product.entity';
import { Category } from './entities/category.entity';
import { Expense } from './entities/expense.entity';
import { ExpensesService, type CreateExpenseInput } from './expenses.service';

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
    await expect(service.create(input(overrides))).rejects.toThrow(BadRequestException);
    await expect(service.create(input(overrides))).rejects.toThrow(message);
    expect(db.rows(Expense)).toHaveLength(0);
  };

  describe('desde una cuenta', () => {
    it('se guarda sin cuotas ni promoción y devuelve el id', async () => {
      const { id } = await service.create(input({ description: 'Mercado', categoryId: MERCADO }));
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
      await service.create(input({ sourceProductId: VISA, installments: 12 }));
      expect(db.rows(Expense)[0]).toMatchObject({ sourceProductId: VISA, installments: 12 });
    });

    it('sin cuotas: 400 (la tarjeta necesita saber a cuántas)', () => rejects({ sourceProductId: VISA }, /cuotas/i));

    it('con promoción al 0 %: guarda E.A. y M.V. resueltas y la descripción', async () => {
      await service.create(
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
      await service.create(input({ sourceProductId: VISA, installments: 8, isOpeningDebt: true }));
      expect(db.rows(Expense)[0]).toMatchObject({ isOpeningDebt: true });
    });
  });

  describe('origen inválido', () => {
    it('desde un préstamo: 400', () => rejects({ sourceProductId: PRESTAMO }, /préstamo/i));

    it('un producto que no existe: 400 con el id', () => rejects({ sourceProductId: 999 }, /999/));

    it('un producto desactivado: 400', () => rejects({ sourceProductId: CERRADA, installments: 1 }, /activ/i));
  });

  describe('categoría', () => {
    it('que no existe: 400', () => rejects({ categoryId: 999 }, /categor/i));

    it('de ingreso en un gasto: 400', () => rejects({ categoryId: SALARIO }, /categor/i));
  });
});
