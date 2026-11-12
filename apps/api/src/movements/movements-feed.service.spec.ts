import { BadRequestException } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Category } from './entities/category.entity';
import { Expense } from './entities/expense.entity';
import { MovementsFeedController } from './movements-feed.controller';
import { DEFAULT_LIMIT, MovementsFeedService } from './movements-feed.service';

// GET /movements: lo que ya pasó, mezclado y ordenado. Datos ficticios.

const VISA = 1;
const AHORROS = 2;
const PRESTAMO = 3;
const MERCADO = 10;
const TODAY = '2026-11-12';

const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);

describe('MovementsFeedService', () => {
  let db: FakeDb;
  let service: MovementsFeedService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Visa', bank: 'B', last4: '1234', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', bank: 'B', last4: '5678', active: true },
      { id: PRESTAMO, kind: 'loan', name: 'Préstamo', bank: 'B', last4: '9999', active: true },
    ]);
    db.seed(Category, [{ id: MERCADO, name: 'Mercado', kind: 'expense' }]);
    service = new MovementsFeedService(db.dataSource());
  });

  const expense = (id: number, date: string, createdAt: Date, extra: Partial<Expense> = {}): Partial<Expense> => ({
    id,
    date,
    amountCents: 100,
    description: `gasto ${id}`,
    sourceProductId: AHORROS,
    categoryId: null,
    installments: null,
    isOpeningDebt: false,
    createdAt,
    ...extra,
  });
  const income = (
    id: number,
    date: string,
    createdAt: Date,
    extra: Partial<OneOffIncome> = {},
  ): Partial<OneOffIncome> => ({
    id,
    date,
    amountCents: 500,
    description: `ingreso ${id}`,
    categoryId: null,
    destinationAccountId: AHORROS,
    createdAt,
    ...extra,
  });

  describe('lo registrado', () => {
    it('mezcla gastos, ingresos y abonos, del más reciente al más viejo', async () => {
      db.seed(Expense, [expense(1, '2026-11-05', at('2026-11-05', 9)), expense(2, '2026-11-10', at('2026-11-10', 9))]);
      db.seed(OneOffIncome, [income(1, '2026-11-08', at('2026-11-08', 9))]);
      db.seed(CapitalPayment, [
        {
          id: 1,
          productId: VISA,
          date: '2026-11-09',
          amountCents: 300,
          expenseId: null,
          createdAt: at('2026-11-09', 9),
        },
      ]);

      const list = await service.list(20, TODAY);
      expect(list.map((m) => m.id)).toEqual(['expense:2', 'capital:1', 'income:1', 'expense:1']);
      expect(list.map((m) => [m.type, m.direction])).toEqual([
        ['expense', 'out'],
        ['capital_payment', 'out'],
        ['income', 'in'],
        ['expense', 'out'],
      ]);
    });

    it('el mismo día se desempata por hora de registro: el último registrado primero', async () => {
      db.seed(Expense, [expense(1, '2026-11-10', at('2026-11-10', 8)), expense(2, '2026-11-10', at('2026-11-10', 18))]);
      db.seed(OneOffIncome, [income(1, '2026-11-10', at('2026-11-10', 12))]);

      expect((await service.list(20, TODAY)).map((m) => m.id)).toEqual(['expense:2', 'income:1', 'expense:1']);
    });

    it('si hasta la hora empata, el id más alto va primero', async () => {
      const same = at('2026-11-10', 8);
      db.seed(Expense, [expense(1, '2026-11-10', same), expense(2, '2026-11-10', same)]);
      expect((await service.list(20, TODAY)).map((m) => m.id)).toEqual(['expense:2', 'expense:1']);
    });

    it('un movimiento con fecha futura no sale: es de Próximos', async () => {
      db.seed(OneOffIncome, [income(1, '2026-11-20', at('2026-11-01', 9)), income(2, TODAY, at('2026-11-12', 9))]);
      db.seed(Expense, [expense(1, '2026-12-01', at('2026-11-01', 9))]);
      expect((await service.list(20, TODAY)).map((m) => m.id)).toEqual(['income:2']);
    });

    it('el monto va en positivo y la dirección dice el signo', async () => {
      db.seed(Expense, [expense(1, '2026-11-10', at('2026-11-10', 9), { amountCents: 12_000_000 })]);
      db.seed(OneOffIncome, [income(1, '2026-11-09', at('2026-11-09', 9), { amountCents: 50_000_000 })]);
      const [out, inc] = await service.list(20, TODAY);
      expect([out?.amountCents, out?.direction]).toEqual([12_000_000, 'out']);
      expect([inc?.amountCents, inc?.direction]).toEqual([50_000_000, 'in']);
    });
  });

  describe('limit', () => {
    it('por defecto son 20', async () => {
      db.seed(
        Expense,
        Array.from({ length: 25 }, (_, i) => expense(i + 1, '2026-11-10', at('2026-11-10', 1 + (i % 20)))),
      );
      expect(DEFAULT_LIMIT).toBe(20);
      expect(await service.list(undefined, TODAY)).toHaveLength(20);
    });

    it('corta en `limit` y no pierde ninguno de los más recientes entre tablas', async () => {
      // Los 3 más recientes están repartidos entre las tres tablas y el resto es más viejo
      db.seed(Expense, [
        expense(1, '2026-11-12', at('2026-11-12', 9)),
        expense(2, '2026-11-01', at('2026-11-01', 9)),
        expense(3, '2026-11-02', at('2026-11-02', 9)),
      ]);
      db.seed(OneOffIncome, [
        income(1, '2026-11-11', at('2026-11-11', 9)),
        income(2, '2026-11-03', at('2026-11-03', 9)),
        income(3, '2026-11-04', at('2026-11-04', 9)),
      ]);
      db.seed(CapitalPayment, [
        { id: 1, productId: VISA, date: '2026-11-10', amountCents: 1, expenseId: null, createdAt: at('2026-11-10', 9) },
        { id: 2, productId: VISA, date: '2026-11-05', amountCents: 1, expenseId: null, createdAt: at('2026-11-05', 9) },
      ]);

      expect((await service.list(3, TODAY)).map((m) => m.id)).toEqual(['expense:1', 'income:1', 'capital:1']);
    });

    it('lo programado entra a la mezcla y también se corta', async () => {
      db.seed(RecurringIncome, [
        { id: 1, name: 'Salario', amountCents: 300, dayOfMonth: 5, startDate: '2026-01-01', endDate: null },
      ]);
      db.seed(Expense, [expense(1, '2026-11-12', at('2026-11-12', 9)), expense(2, '2026-11-01', at('2026-11-01', 9))]);
      expect((await service.list(2, TODAY)).map((m) => m.id)).toEqual(['expense:1', 'recurring:1:2026-11-05']);
    });
  });

  describe('lo programado', () => {
    const salary = (extra: Partial<RecurringIncome> = {}): Partial<RecurringIncome> => ({
      id: 1,
      name: 'Salario',
      amountCents: 300,
      dayOfMonth: 5,
      startDate: '2026-01-01',
      endDate: null,
      destinationAccountId: AHORROS,
      ...extra,
    });
    const scheduledIds = async (today = TODAY) =>
      (await service.list(100, today)).filter((m) => m.scheduled).map((m) => m.id);

    it('las fechas ya vencidas de los últimos 60 días, hasta hoy incluido', async () => {
      db.seed(RecurringIncome, [salary({ dayOfMonth: 12 })]); // hoy es 12
      db.seed(FixedExpense, [
        {
          id: 4,
          name: 'Arriendo',
          amountCents: 1200,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          cardId: null,
        },
      ]);
      expect(await scheduledIds()).toEqual([
        'recurring:1:2026-11-12',
        'fixed:4:2026-11-05',
        'recurring:1:2026-10-12',
        'fixed:4:2026-10-05', // el del 5 de sep (hace 68 días) ya quedó fuera de la ventana
      ]);
    });

    it('no salen las futuras (después de hoy) ni las de hace más de 60 días', async () => {
      db.seed(RecurringIncome, [salary({ dayOfMonth: 20 })]);
      // Hoy 12 de nov: el 20 de nov es futuro; el 20 de oct y el 20 de sep (hace 53 días) caen dentro de 60
      // días; el 20 de agosto (hace 84) no
      expect(await scheduledIds()).toEqual(['recurring:1:2026-10-20', 'recurring:1:2026-09-20']);
    });

    it('no salen antes de startDate ni después de endDate', async () => {
      db.seed(RecurringIncome, [salary({ startDate: '2026-10-06', endDate: '2026-10-31' })]);
      db.seed(FixedExpense, [
        {
          id: 4,
          name: 'Gimnasio',
          amountCents: 80,
          dayOfMonth: 5,
          startDate: '2026-09-06',
          endDate: '2026-10-04',
          cardId: null,
        },
      ]);
      // El salario del 5 de oct es anterior a startDate (6 de oct) y el del 5 de nov, posterior a endDate;
      // el gimnasio del 5 de oct es posterior a su endDate (4 de oct) y el del 5 de sep, anterior a su inicio
      expect(await scheduledIds()).toEqual([]);
    });

    it('un fin que es justo la fecha sí incluye esa ocurrencia', async () => {
      db.seed(RecurringIncome, [salary({ endDate: '2026-11-05' })]);
      expect((await scheduledIds())[0]).toBe('recurring:1:2026-11-05');
    });

    it('el día 31 cae en el último día de un mes corto', async () => {
      db.seed(RecurringIncome, [salary({ dayOfMonth: 31 })]);
      // Hoy 15 de marzo de 2026: 60 días atrás es el 14 de enero → 31 de enero y 28 de febrero
      expect(await scheduledIds('2026-03-15')).toEqual(['recurring:1:2026-02-28', 'recurring:1:2026-01-31']);
    });

    it('se marcan como programadas, con el nombre como descripción y el signo de su tipo', async () => {
      db.seed(RecurringIncome, [salary()]);
      db.seed(FixedExpense, [
        {
          id: 4,
          name: 'Arriendo',
          amountCents: 1200,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          categoryId: MERCADO,
          cardId: null,
        },
      ]);
      const list = await service.list(100, TODAY);
      const pay = list.find((m) => m.id === 'recurring:1:2026-11-05');
      const rent = list.find((m) => m.id === 'fixed:4:2026-11-05');
      expect(pay).toMatchObject({
        type: 'income',
        direction: 'in',
        scheduled: true,
        description: 'Salario',
        amountCents: 300,
      });
      expect(rent).toMatchObject({
        type: 'expense',
        direction: 'out',
        scheduled: true,
        description: 'Arriendo',
        categoryName: 'Mercado',
      });
    });

    it('en un empate de fecha va después de lo registrado', async () => {
      db.seed(RecurringIncome, [salary()]);
      db.seed(Expense, [expense(1, '2026-11-05', at('2026-11-05', 1))]);
      const ids = (await service.list(100, TODAY)).map((m) => m.id);
      expect(ids.indexOf('expense:1')).toBeLessThan(ids.indexOf('recurring:1:2026-11-05'));
    });
  });

  describe('de dónde salió cada uno', () => {
    it('un gasto con tarjeta trae la tarjeta, las cuotas y si es deuda inicial', async () => {
      db.seed(Expense, [
        expense(1, '2026-11-10', at('2026-11-10', 9), {
          sourceProductId: VISA,
          installments: 3,
          isOpeningDebt: true,
          categoryId: MERCADO,
        }),
        expense(2, '2026-11-09', at('2026-11-09', 9), { sourceProductId: AHORROS }),
      ]);
      const [card, account] = await service.list(20, TODAY);
      expect(card).toMatchObject({
        product: { id: VISA, name: 'Visa', last4: '1234', kind: 'credit_card' },
        installments: 3,
        isOpeningDebt: true,
        categoryName: 'Mercado',
      });
      expect(account).toMatchObject({
        product: { id: AHORROS, name: 'Ahorros', last4: '5678', kind: 'account' },
        installments: null,
        isOpeningDebt: false,
        categoryName: null,
      });
    });

    it('un ingreso trae su cuenta destino, o null si no la tiene', async () => {
      db.seed(OneOffIncome, [
        income(1, '2026-11-10', at('2026-11-10', 9)),
        income(2, '2026-11-09', at('2026-11-09', 9), { destinationAccountId: null }),
      ]);
      const [withAccount, without] = await service.list(20, TODAY);
      expect(withAccount?.product).toMatchObject({ id: AHORROS, kind: 'account' });
      expect(without?.product).toBeNull();
    });

    it('un abono trae el producto al que se abonó, incluso un préstamo', async () => {
      db.seed(CapitalPayment, [
        {
          id: 1,
          productId: PRESTAMO,
          date: '2026-11-10',
          amountCents: 1,
          expenseId: null,
          createdAt: at('2026-11-10', 9),
        },
      ]);
      expect((await service.list(20, TODAY))[0]?.product).toMatchObject({ id: PRESTAMO, kind: 'loan' });
    });

    it('un gasto fijo con tarjeta trae la tarjeta; sin tarjeta, ningún producto; un salario, su cuenta', async () => {
      db.seed(FixedExpense, [
        {
          id: 1,
          name: 'Netflix',
          amountCents: 30,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          cardId: VISA,
        },
        {
          id: 2,
          name: 'Arriendo',
          amountCents: 1200,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          cardId: null,
        },
        {
          id: 3,
          name: 'Gimnasio',
          amountCents: 100,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          cardId: null,
          accountId: AHORROS,
        },
      ]);
      db.seed(RecurringIncome, [
        {
          id: 1,
          name: 'Salario',
          amountCents: 300,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: null,
          destinationAccountId: AHORROS,
        },
      ]);
      const list = await service.list(100, TODAY);
      const byId = (id: string) => list.find((m) => m.id === id);
      expect(byId('fixed:1:2026-11-05')?.product).toMatchObject({ id: VISA, kind: 'credit_card' });
      expect(byId('fixed:2:2026-11-05')?.product).toBeNull();
      expect(byId('fixed:3:2026-11-05')?.product).toMatchObject({ id: AHORROS, kind: 'account', name: 'Ahorros' });
      expect(byId('recurring:1:2026-11-05')?.product).toMatchObject({ id: AHORROS, name: 'Ahorros' });
    });

    it('sin nada registrado ni programado, una lista vacía', async () => {
      expect(await service.list(20, TODAY)).toEqual([]);
    });
  });
});

describe('MovementsFeedController: limit', () => {
  const calls: number[] = [];
  const controller = new MovementsFeedController({
    list: (limit: number) => {
      calls.push(limit);
      return Promise.resolve([]);
    },
  } as unknown as MovementsFeedService);
  const parse = (value: string | undefined) =>
    value === undefined ? Promise.resolve(DEFAULT_LIMIT) : new ParseIntPipe().transform(value, { type: 'query' });

  it('acepta de 1 a 100', async () => {
    await controller.list(1);
    await controller.list(100);
    expect(calls).toEqual([1, 100]);
  });

  it('rechaza 0 y 101 con 400', () => {
    expect(() => controller.list(0)).toThrow(BadRequestException);
    expect(() => controller.list(101)).toThrow(BadRequestException);
    expect(() => controller.list(-5)).toThrow(/entre 1 y 100/);
  });

  it('un texto que no es número es 400 (ParseIntPipe) y sin limit se usa el 20', async () => {
    await expect(parse('abc')).rejects.toThrow(BadRequestException);
    await expect(parse('5.5')).rejects.toThrow(BadRequestException);
    await expect(parse(undefined)).resolves.toBe(20);
    await expect(parse('7')).resolves.toBe(7);
  });
});
