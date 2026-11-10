import { BadRequestException } from '@nestjs/common';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { CapitalPaymentsService, type CreateCapitalPaymentInput } from './capital-payments.service';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Expense } from './entities/expense.entity';

// Un abono extra a capital de una tarjeta o un préstamo.
// La regla fina: con expenseId, la compra tiene que ser de ESA tarjeta y anterior al abono.
// Usa el FakeDb compartido; el service lee con getRepository(...).findOneBy y guarda con save.
// Datos ficticios.

const VISA = 1;
const MASTER = 2;
const PRESTAMO = 3;
const AHORROS = 4;
const VIEJA = 5;
const TV = 20; // compra con VISA el 2026-03-12
const NEVERA = 21; // compra con MASTER

const input = (overrides: Partial<CreateCapitalPaymentInput> = {}): CreateCapitalPaymentInput => ({
  productId: VISA,
  date: '2026-03-25',
  amountCents: 20_000_000,
  ...overrides,
});

describe('CapitalPaymentsService.create', () => {
  let db: FakeDb;
  let service: CapitalPaymentsService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', active: true },
      { id: MASTER, kind: 'credit_card', active: true },
      { id: PRESTAMO, kind: 'loan', active: true },
      { id: AHORROS, kind: 'account', active: true },
      { id: VIEJA, kind: 'credit_card', active: false },
    ]);
    db.seed(Expense, [
      { id: TV, sourceProductId: VISA, date: '2026-03-12', installments: 3 },
      { id: NEVERA, sourceProductId: MASTER, date: '2026-03-01', installments: 6 },
    ]);
    service = new CapitalPaymentsService(db.dataSource());
  });

  const rejects = async (overrides: Partial<CreateCapitalPaymentInput>, message: RegExp) => {
    await expect(service.create(input(overrides))).rejects.toThrow(BadRequestException);
    await expect(service.create(input(overrides))).rejects.toThrow(message);
    expect(db.rows(CapitalPayment)).toHaveLength(0);
  };

  describe('a una tarjeta', () => {
    it('sin compra: se guarda y el motor lo reparte por mayor tasa', async () => {
      const { id } = await service.create(input());
      const [saved] = db.rows(CapitalPayment);
      expect(saved).toMatchObject({ id, productId: VISA, date: '2026-03-25', amountCents: 20_000_000 });
      expect(saved?.expenseId ?? null).toBeNull();
    });

    it('a una compra de esa tarjeta, con el modo pedido', async () => {
      await service.create(input({ expenseId: TV, mode: 'reduce_payment' }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ expenseId: TV, mode: 'reduce_payment' });
    });

    it('a una compra de OTRA tarjeta: 400', () => rejects({ expenseId: NEVERA }, /tarjeta/i));

    it('a una compra que no existe: 400 con el id', () => rejects({ expenseId: 999 }, /999/));

    it('antes de la fecha de la compra: 400 (no se abona lo que aún no se debe)', () =>
      rejects({ expenseId: TV, date: '2026-03-11' }, /antes/i));

    it('el mismo día de la compra sí se puede', async () => {
      await service.create(input({ expenseId: TV, date: '2026-03-12' }));
      expect(db.rows(CapitalPayment)).toHaveLength(1);
    });
  });

  describe('a un préstamo', () => {
    it('se guarda sin compra', async () => {
      await service.create(input({ productId: PRESTAMO }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ productId: PRESTAMO });
    });

    it('con expenseId: 400 (un préstamo no tiene compras)', () =>
      rejects({ productId: PRESTAMO, expenseId: TV }, /compra/i));
  });

  describe('destino inválido', () => {
    it('a una cuenta: 400', () => rejects({ productId: AHORROS }, /cuenta/i));

    it('a un producto que no existe: 400 con el id', () => rejects({ productId: 999 }, /999/));

    it('a un producto desactivado: 400', () => rejects({ productId: VIEJA }, /activ/i));
  });
});
