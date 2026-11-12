import { BadRequestException, NotFoundException } from '@nestjs/common';
import { rateFromMv } from '@greenlight/engine';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { CapitalPaymentsService, type CreateCapitalPaymentInput } from './capital-payments.service';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Expense } from './entities/expense.entity';

// Un abono extra a capital de una tarjeta o un préstamo.
// La regla fina: con expenseId, la compra tiene que ser de ESA tarjeta y anterior al abono; y el monto no pasa
// de lo que todavía no está facturado. Usa el FakeDb compartido. Datos ficticios.

const VISA = 1;
const MASTER = 2;
const PRESTAMO = 3;
const AHORROS = 4;
const VIEJA = 5;
const CORRIENTE = 6;
const CERRADA = 7;
const TV = 20; // compra con VISA el 2026-03-12: 1.000.000 a 3 cuotas (cortes 15 mar, 15 abr, 15 may)
const NEVERA = 21; // compra con MASTER

/** Lo que queda sin facturar de la TV después del corte del 15 de marzo: 2/3 de 1.000.000. */
const LIMIT = 66_666_667;

const input = (overrides: Partial<CreateCapitalPaymentInput> = {}): CreateCapitalPaymentInput => ({
  productId: VISA,
  date: '2026-03-25',
  amountCents: 20_000_000,
  ...overrides,
});

describe('CapitalPaymentsService', () => {
  let db: FakeDb;
  let service: CapitalPaymentsService;

  beforeEach(() => {
    db = new FakeDb();
    for (const entity of [CreditCard, Loan]) db.withoutId.add(entity);
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Nu', last4: '4174', active: true },
      { id: MASTER, kind: 'credit_card', active: true },
      { id: PRESTAMO, kind: 'loan', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', last4: '1357', active: true },
      { id: VIEJA, kind: 'credit_card', active: false },
      { id: CORRIENTE, kind: 'account', name: 'Corriente', last4: '2468', active: true },
      { id: CERRADA, kind: 'account', name: 'Cerrada', last4: '0000', active: false },
    ]);
    const card = (productId: number) => ({
      productId,
      creditLimitCents: 500_000_000,
      cutDay: 15,
      dueDay: 5,
      handlingFeeCents: 0,
      insuranceCents: 0,
      minPaymentMethod: 'constant_capital' as const,
      singleInstallmentInterestFree: true,
      firstPeriodInterest: 'full_month' as const,
    });
    db.seed(CreditCard, [card(VISA), card(MASTER)]);
    db.seed(Loan, [
      {
        productId: PRESTAMO,
        principalCents: 1_000_000_00,
        termMonths: 12,
        firstPaymentDate: '2026-04-10',
        fixedPaymentCents: null,
        insuranceCents: 0,
        method: 'fixed_installment',
      },
    ]);
    const { ea, mv } = rateFromMv('0.02');
    db.seed(
      ProductRate,
      [VISA, MASTER, PRESTAMO].map((productId, i) => ({
        id: i + 1,
        productId,
        effectiveFrom: '2026-01-01',
        ea,
        mv,
        source: 'mv' as const,
      })),
    );
    const purchase = (id: number, sourceProductId: number, date: string, installments: number) => ({
      id,
      sourceProductId,
      date,
      installments,
      amountCents: 100_000_000,
      promoEa: null,
      promoMv: null,
      isOpeningDebt: false,
    });
    db.seed(Expense, [purchase(TV, VISA, '2026-03-12', 3), purchase(NEVERA, MASTER, '2026-03-01', 6)]);
    service = new CapitalPaymentsService(db.dataSource());

    // Postgres devuelve null/false en las columnas sin valor; el DataSource falso las deja sin definir
    const create = service.create.bind(service);
    service.create = async (data) => {
      const saved = await create(data);
      for (const p of db.rows(CapitalPayment)) {
        p.expenseId ??= null;
        p.sourceAccountId ??= null;
        p.isExternal ??= false;
        p.mode ??= 'reduce_term';
      }
      return saved;
    };
  });

  const rejects = async (overrides: Partial<CreateCapitalPaymentInput>, message: RegExp) => {
    await expect(service.create(input(overrides))).rejects.toThrow(BadRequestException);
    await expect(service.create(input(overrides))).rejects.toThrow(message);
    expect(db.rows(CapitalPayment)).toHaveLength(0);
  };

  describe('create: a una tarjeta', () => {
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

  describe('create: a un préstamo', () => {
    it('se guarda sin compra', async () => {
      await service.create(input({ productId: PRESTAMO }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ productId: PRESTAMO });
    });

    it('con expenseId: 400 (un préstamo no tiene compras)', () =>
      rejects({ productId: PRESTAMO, expenseId: TV }, /compra/i));

    it('hasta el saldo sí; un peso (100 centavos) más, no', async () => {
      await rejects({ productId: PRESTAMO, amountCents: 1_000_000_00 + 100 }, /hasta .*1.000.000.*debes del préstamo/);
      await service.create(input({ productId: PRESTAMO, amountCents: 1_000_000_00 }));
      expect(db.rows(CapitalPayment)).toHaveLength(1);
    });
  });

  describe('create: destino inválido', () => {
    it('a una cuenta: 400', () => rejects({ productId: AHORROS }, /cuenta/i));

    it('a un producto que no existe: 400 con el id', () => rejects({ productId: 999 }, /999/));

    it('a un producto desactivado: 400', () => rejects({ productId: VIEJA }, /activ/i));
  });

  describe('create: de dónde sale el dinero', () => {
    it('de una cuenta: guarda sourceAccountId y no es externo', async () => {
      await service.create(input({ sourceAccountId: AHORROS }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ sourceAccountId: AHORROS });
      expect(db.rows(CapitalPayment)[0]?.isExternal ?? false).toBe(false);
    });

    it('externo: isExternal y ninguna cuenta', async () => {
      await service.create(input({ external: true }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ isExternal: true });
      expect(db.rows(CapitalPayment)[0]?.sourceAccountId ?? null).toBeNull();
    });

    it('las dos cosas: 400', () =>
      rejects({ sourceAccountId: AHORROS, external: true }, /cuenta o es externo, no de las dos/));

    it('ninguna: se acepta como antes (compatibilidad)', async () => {
      await service.create(input());
      expect(db.rows(CapitalPayment)).toHaveLength(1);
    });

    it('external: false cuenta como ninguna', async () => {
      await service.create(input({ external: false, sourceAccountId: AHORROS }));
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ sourceAccountId: AHORROS });
    });

    it('una cuenta que no existe, que es una tarjeta o que está cerrada: 400', async () => {
      await rejects({ sourceAccountId: 999 }, /999/);
      await rejects({ sourceAccountId: MASTER }, /no existe/);
      await rejects({ sourceAccountId: CERRADA }, /desactivada/);
    });
  });

  describe('create: el límite es la deuda abonable (lo que no está facturado)', () => {
    it('justo en el límite sí; un peso (100 centavos) más, no', async () => {
      await service.create(input({ amountCents: LIMIT }));
      db.seed(CapitalPayment, []);
      await rejects({ amountCents: LIMIT + 1 }, /Solo puedes abonar hasta .*666\.667.*no está facturado/);
    });

    it('con la compra, el límite es el de esa compra', async () => {
      // Otra compra de la misma tarjeta suma al límite general, pero no al de la TV
      db.seed(Expense, [
        ...db.rows(Expense),
        Object.assign(new Expense(), {
          id: 22,
          sourceProductId: VISA,
          date: '2026-03-13',
          installments: 3,
          amountCents: 100_000_000,
          promoEa: null,
          promoMv: null,
          isOpeningDebt: false,
        }),
      ]);
      await service.create(input({ amountCents: LIMIT + 1_000, expenseId: undefined }));
      db.seed(CapitalPayment, []);
      await rejects({ expenseId: TV, amountCents: LIMIT + 1 }, /Solo puedes abonar hasta/);
    });

    it('los abonos que ya hay bajan el límite', async () => {
      await service.create(input({ amountCents: LIMIT - 100 }));
      await expect(service.create(input({ amountCents: 101 }))).rejects.toThrow(/Solo puedes abonar hasta/);
      await expect(service.create(input({ amountCents: 100 }))).resolves.toBeDefined();
      expect(db.rows(CapitalPayment)).toHaveLength(2);
    });

    it('si todo ya está facturado, no hay deuda para abonar', () =>
      rejects({ date: '2026-06-01', amountCents: 1 }, /No hay deuda para abonar/));

    it('un externo cuenta igual para el límite', () =>
      rejects({ external: true, amountCents: LIMIT + 1 }, /Solo puedes abonar/));
  });

  describe('listOfCard', () => {
    it('del más reciente al más viejo, con el origen de cada uno', async () => {
      db.seed(CapitalPayment, [
        {
          id: 1,
          productId: VISA,
          date: '2026-03-20',
          amountCents: 100,
          mode: 'reduce_term',
          sourceAccountId: AHORROS,
          isExternal: false,
          createdAt: new Date('2026-03-20T10:00:00Z'),
        },
        {
          id: 2,
          productId: VISA,
          date: '2026-03-25',
          amountCents: 200,
          mode: 'reduce_payment',
          sourceAccountId: null,
          isExternal: true,
          createdAt: new Date('2026-03-25T10:00:00Z'),
        },
        {
          id: 3,
          productId: VISA,
          date: '2026-03-10',
          amountCents: 300,
          mode: 'reduce_term',
          sourceAccountId: null,
          isExternal: false,
          createdAt: new Date('2026-03-10T10:00:00Z'),
        },
        {
          id: 4,
          productId: MASTER,
          date: '2026-03-26',
          amountCents: 400,
          mode: 'reduce_term',
          sourceAccountId: null,
          isExternal: false,
          createdAt: new Date('2026-03-26T10:00:00Z'),
        },
      ]);
      const list = await service.listOfProduct(VISA, 'credit_card');

      expect(list.map((p) => p.id)).toEqual([2, 1, 3]);
      expect(list[0]).toMatchObject({ amountCents: 200, mode: 'reduce_payment', source: { kind: 'external' } });
      expect(list[1]?.source).toEqual({ kind: 'account', id: AHORROS, name: 'Ahorros', last4: '1357' });
      expect(list[2]?.source).toBeNull();
    });

    it('también los de un préstamo; para un préstamo, cualquier otro producto es 404', async () => {
      db.seed(CapitalPayment, [
        {
          id: 1,
          productId: PRESTAMO,
          date: '2026-03-20',
          amountCents: 100,
          mode: 'reduce_term',
          sourceAccountId: null,
          isExternal: true,
          createdAt: new Date('2026-03-20T10:00:00Z'),
        },
        {
          id: 2,
          productId: VISA,
          date: '2026-03-21',
          amountCents: 200,
          mode: 'reduce_term',
          sourceAccountId: null,
          isExternal: false,
          createdAt: new Date('2026-03-21T10:00:00Z'),
        },
      ]);
      expect((await service.listOfProduct(PRESTAMO, 'loan')).map((p) => p.id)).toEqual([1]);
      await expect(service.listOfProduct(VISA, 'loan')).rejects.toThrow(NotFoundException);
      await expect(service.listOfProduct(999, 'loan')).rejects.toThrow(NotFoundException);
    });

    it('404 si la tarjeta no existe y 400 si no es una tarjeta', async () => {
      await expect(service.listOfProduct(999, 'credit_card')).rejects.toThrow(NotFoundException);
      await expect(service.listOfProduct(AHORROS, 'credit_card')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('borra el abono; solo ese', async () => {
      db.seed(CapitalPayment, [
        { id: 1, productId: VISA, date: '2026-03-20', amountCents: 100 },
        { id: 2, productId: VISA, date: '2026-03-21', amountCents: 100 },
      ]);
      await service.remove(1);
      expect(db.rows(CapitalPayment).map((p) => p.id)).toEqual([2]);
    });

    it('404 si no existe', async () => {
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
