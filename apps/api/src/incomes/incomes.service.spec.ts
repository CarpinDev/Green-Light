import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      { id: VISA, kind: 'credit_card', name: 'Visa', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', active: true },
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
      await service.createOneOffIncome({
        ...bonus,
        description: 'Prima',
        categoryId: SALARIO,
        destinationAccountId: AHORROS,
      });
      expect(db.rows(OneOffIncome)[0]).toMatchObject({
        description: 'Prima',
        categoryId: SALARIO,
        destinationAccountId: AHORROS,
      });
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

  describe('listados', () => {
    const TODAY = '2026-06-15';

    beforeEach(() => {
      db.seed(RecurringIncome, [
        {
          id: 1,
          name: 'Salario',
          amountCents: 300,
          dayOfMonth: 30,
          startDate: '2026-01-01',
          endDate: null,
          destinationAccountId: AHORROS,
        },
        { id: 2, name: 'Freelance', amountCents: 100, dayOfMonth: 5, startDate: '2026-01-01', endDate: '2026-05-31' },
        {
          id: 3,
          name: 'Arriendo recibido',
          amountCents: 200,
          dayOfMonth: 5,
          startDate: '2026-01-01',
          endDate: '2026-06-15',
        },
      ]);
      db.seed(FixedExpense, [
        {
          id: 1,
          name: 'Netflix',
          amountCents: 30,
          dayOfMonth: 20,
          startDate: '2026-01-01',
          endDate: null,
          cardId: VISA,
          categoryId: MERCADO,
        },
        { id: 2, name: 'Arriendo', amountCents: 1200, dayOfMonth: 1, startDate: '2026-01-01', endDate: null },
        { id: 3, name: 'Gimnasio', amountCents: 80, dayOfMonth: 1, startDate: '2025-01-01', endDate: '2026-03-01' },
      ]);
    });

    it('ingresos: por día y nombre, con active y el nombre de la cuenta (o null)', async () => {
      const list = await service.listRecurringIncomes({}, TODAY);
      expect(list.map((r) => [r.name, r.active])).toEqual([
        ['Arriendo recibido', true], // termina hoy: todavía vigente
        ['Freelance', false],
        ['Salario', true],
      ]);
      expect(list[2]).toMatchObject({
        destinationAccountId: AHORROS,
        destinationAccountName: 'Ahorros',
        endDate: null,
      });
      expect(list[1]).toMatchObject({ destinationAccountId: null, destinationAccountName: null });
    });

    it('?active filtra por vigencia', async () => {
      const active = await service.listRecurringIncomes({ active: true }, TODAY);
      expect(active.map((r) => r.name)).toEqual(['Arriendo recibido', 'Salario']);
      const ended = await service.listRecurringIncomes({ active: false }, TODAY);
      expect(ended.map((r) => r.name)).toEqual(['Freelance']);
    });

    it('gastos fijos: con el nombre de la tarjeta y la categoría', async () => {
      const list = await service.listFixedExpenses({}, TODAY);
      expect(list.map((r) => [r.name, r.active])).toEqual([
        ['Arriendo', true],
        ['Gimnasio', false],
        ['Netflix', true],
      ]);
      expect(list[2]).toMatchObject({ cardId: VISA, cardName: 'Visa', categoryId: MERCADO });
      expect(list[0]).toMatchObject({ cardId: null, cardName: null });
      const active = await service.listFixedExpenses({ active: true }, TODAY);
      expect(active.map((r) => r.name)).toEqual(['Arriendo', 'Netflix']);
    });
  });

  describe('editar', () => {
    beforeEach(() => {
      db.seed(RecurringIncome, [
        { id: 1, name: 'Salario', amountCents: 300, dayOfMonth: 30, startDate: '2026-03-01', endDate: null },
      ]);
      db.seed(FixedExpense, [
        { id: 1, name: 'Netflix', amountCents: 30, dayOfMonth: 20, startDate: '2026-03-01', endDate: null },
      ]);
    });

    it('cambia solo lo que llega y no toca el monto ni el inicio', async () => {
      await service.updateRecurringIncome(1, { name: 'Sueldo', dayOfMonth: 15, destinationAccountId: AHORROS });
      expect(db.rows(RecurringIncome)[0]).toMatchObject({
        name: 'Sueldo',
        dayOfMonth: 15,
        destinationAccountId: AHORROS,
        amountCents: 300,
        startDate: '2026-03-01',
      });
    });

    it('un endDate anterior al inicio guardado es 400 y no escribe', async () => {
      await expect(service.updateRecurringIncome(1, { endDate: '2026-02-28' })).rejects.toThrow(BadRequestException);
      await expect(service.updateFixedExpense(1, { endDate: '2026-02-28' })).rejects.toThrow(BadRequestException);
      expect(db.rows(RecurringIncome)[0]?.endDate).toBeNull();
    });

    it('endDate null reactiva uno terminado', async () => {
      await service.updateRecurringIncome(1, { endDate: '2026-04-30' });
      expect(db.rows(RecurringIncome)[0]?.endDate).toBe('2026-04-30');
      await service.updateRecurringIncome(1, { endDate: null });
      expect(db.rows(RecurringIncome)[0]?.endDate).toBeNull();
    });

    it('aplica las reglas del create: cuenta, tarjeta activa y categoría de gasto', async () => {
      await expect(service.updateRecurringIncome(1, { destinationAccountId: VISA })).rejects.toThrow(/cuenta/i);
      await expect(service.updateFixedExpense(1, { cardId: CERRADA })).rejects.toThrow(BadRequestException);
      await expect(service.updateFixedExpense(1, { categoryId: SALARIO })).rejects.toThrow(/categor/i);
      await service.updateFixedExpense(1, { cardId: VISA, categoryId: MERCADO });
      expect(db.rows(FixedExpense)[0]).toMatchObject({ cardId: VISA, categoryId: MERCADO });
    });

    it('un id que no existe es 404', async () => {
      await expect(service.updateRecurringIncome(99, { name: 'x' })).rejects.toThrow(NotFoundException);
      await expect(service.updateFixedExpense(99, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('cambiar el monto', () => {
    beforeEach(() => {
      db.seed(RecurringIncome, [
        {
          id: 1,
          name: 'Salario',
          amountCents: 300,
          dayOfMonth: 30,
          startDate: '2026-01-01',
          endDate: null,
          destinationAccountId: AHORROS,
        },
      ]);
      db.seed(FixedExpense, [
        {
          id: 1,
          name: 'Arriendo',
          amountCents: 1200,
          dayOfMonth: 1,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          cardId: VISA,
        },
      ]);
    });

    it('cierra el registro el día anterior y abre uno nuevo: rangos contiguos sin solaparse', async () => {
      const { id } = await service.changeRecurringIncomeAmount(1, { amountCents: 350, effectiveFrom: '2026-07-01' });
      const [old, created] = db.rows(RecurringIncome);
      expect(old).toMatchObject({ id: 1, amountCents: 300, startDate: '2026-01-01', endDate: '2026-06-30' });
      expect(created).toMatchObject({
        id,
        name: 'Salario',
        amountCents: 350,
        dayOfMonth: 30,
        startDate: '2026-07-01',
        endDate: null,
        destinationAccountId: AHORROS,
      });
      expect(id).not.toBe(1);
    });

    it('el día anterior cruza meses y años (1 de enero -> 31 de diciembre)', async () => {
      await service.changeRecurringIncomeAmount(1, { amountCents: 350, effectiveFrom: '2027-01-01' });
      expect(db.rows(RecurringIncome)[0]?.endDate).toBe('2026-12-31');
    });

    it('conserva el fin que ya tenía el registro en el nuevo', async () => {
      await service.changeFixedExpenseAmount(1, { amountCents: 1300, effectiveFrom: '2026-07-01' });
      const [old, created] = db.rows(FixedExpense);
      expect(old?.endDate).toBe('2026-06-30');
      expect(created).toMatchObject({
        amountCents: 1300,
        startDate: '2026-07-01',
        endDate: '2026-12-31',
        cardId: VISA,
      });
    });

    it('effectiveFrom igual o anterior al inicio es 400', async () => {
      for (const effectiveFrom of ['2026-01-01', '2025-12-01']) {
        await expect(service.changeRecurringIncomeAmount(1, { amountCents: 350, effectiveFrom })).rejects.toThrow(
          /después del inicio/,
        );
      }
      expect(db.rows(RecurringIncome)).toHaveLength(1);
    });

    it('si ya terminó antes de effectiveFrom es 400', async () => {
      await expect(
        service.changeFixedExpenseAmount(1, { amountCents: 1300, effectiveFrom: '2027-02-01' }),
      ).rejects.toThrow(/terminó/);
      expect(db.rows(FixedExpense)).toHaveLength(1);
    });

    it('si falla al guardar, no queda nada a medias', async () => {
      db.failOn = RecurringIncome;
      await expect(
        service.changeRecurringIncomeAmount(1, { amountCents: 350, effectiveFrom: '2026-07-01' }),
      ).rejects.toThrow();
      expect(db.rows(RecurringIncome)).toHaveLength(1);
      expect(db.rows(RecurringIncome)[0]?.endDate).toBeNull();
    });

    it('un id que no existe es 404', async () => {
      await expect(
        service.changeRecurringIncomeAmount(99, { amountCents: 350, effectiveFrom: '2026-07-01' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('borrar', () => {
    it('borra el registro; uno que no existe es 404', async () => {
      db.seed(RecurringIncome, [{ id: 1, name: 'Salario', startDate: '2026-01-01' }]);
      db.seed(FixedExpense, [{ id: 1, name: 'Netflix', startDate: '2026-01-01' }]);
      await service.removeRecurringIncome(1);
      await service.removeFixedExpense(1);
      expect(db.rows(RecurringIncome)).toHaveLength(0);
      expect(db.rows(FixedExpense)).toHaveLength(0);
      await expect(service.removeRecurringIncome(1)).rejects.toThrow(NotFoundException);
      await expect(service.removeFixedExpense(1)).rejects.toThrow(NotFoundException);
    });
  });
});
