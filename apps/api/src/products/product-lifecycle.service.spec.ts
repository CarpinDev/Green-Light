import { ConflictException, NotFoundException } from '@nestjs/common';
import { rateFromMv } from '@greenlight/engine';
import type { EntityManager } from 'typeorm';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { buildProjection } from '../projection/build-projection';
import { excludeArchived } from '../projection/exclude-archived';
import { FakeDb } from '../testing/fake-db';
import { AHORROS as P_AHORROS, VISA as P_VISA, facts } from '../testing/projection-facts';
import { AccountsService } from './accounts.service';
import { CardPlanService } from './card-plan.service';
import { CardsService } from './cards.service';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { CreditCard } from './entities/credit-card.entity';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { StatementCheck } from './entities/statement-check.entity';
import { LoansService } from './loans.service';
import { OpeningDebtService } from './opening-debt.service';
import { ProductLifecycleService } from './product-lifecycle.service';
import { ProductsService } from './products.service';

// Eliminar y archivar productos. Datos ficticios.

const NU = 1;
const OTRA = 2;
const AHORROS = 3;
const PRESTAMO = 4;
const TODAY = '2026-11-12';

describe('eliminar y archivar productos', () => {
  let db: FakeDb;
  let lifecycle: ProductLifecycleService;
  let debt: OpeningDebtService;
  let cards: CardsService;
  let products: ProductsService;

  beforeEach(() => {
    db = new FakeDb();
    for (const entity of [CreditCard, Account, Loan]) db.withoutId.add(entity);
    db.seed(Product, [
      { id: NU, kind: 'credit_card', name: 'Nu', bank: 'Nu', last4: '1234', active: true },
      { id: OTRA, kind: 'credit_card', name: 'Otra', bank: 'B', last4: '5555', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', bank: 'B', last4: '2222', active: true },
      { id: PRESTAMO, kind: 'loan', name: 'Préstamo', bank: 'B', last4: '3333', active: true },
    ]);
    const card = (productId: number) => ({
      productId,
      creditLimitCents: 10_000_000_00,
      cutDay: 22,
      dueDay: 4,
      handlingFeeCents: 0,
      insuranceCents: 0,
      minPaymentMethod: 'constant_capital' as const,
      singleInstallmentInterestFree: true,
      firstPeriodInterest: 'prorated' as const,
    });
    db.seed(CreditCard, [card(NU), card(OTRA)]);
    db.seed(Account, [{ productId: AHORROS, accountType: 'savings' }]);
    db.seed(Loan, [
      {
        productId: PRESTAMO,
        principalCents: 1_000_000_00,
        termMonths: 12,
        firstPaymentDate: '2026-12-10',
        fixedPaymentCents: null,
        insuranceCents: 0,
        method: 'fixed_installment',
      },
    ]);
    const { ea, mv } = rateFromMv('0.0230');
    db.seed(
      ProductRate,
      [NU, OTRA, PRESTAMO].map((productId, i) => ({
        id: i + 1,
        productId,
        effectiveFrom: '2026-01-01',
        ea,
        mv,
        source: 'mv' as const,
      })),
    );
    db.seed(AccountBalance, [{ id: 1, productId: AHORROS, asOf: '2026-11-10', balanceCents: 500_000_00 }]);

    lifecycle = new ProductLifecycleService(db.dataSource(), new CardPlanService(db.dataSource()));
    debt = new OpeningDebtService(db.dataSource());
    cards = new CardsService(db.dataSource());
    products = new ProductsService(db.dataSource());
  });

  const expense = (id: number, sourceProductId: number) =>
    Object.assign(new Expense(), {
      id,
      sourceProductId,
      date: '2026-10-01',
      amountCents: 100,
      installments: null,
      isOpeningDebt: false,
      promoEa: null,
      promoMv: null,
    });
  const countOf = (entity: new () => object, key: string, productId: number) =>
    (db.rows(entity) as unknown as Record<string, unknown>[]).filter((r) => r[key] === productId).length;
  /** Como lo devuelve Postgres: sin promoción, null y no undefined. */
  const asInDb = () => {
    for (const e of db.rows(Expense)) {
      e.promoEa ??= null;
      e.promoMv ??= null;
    }
  };

  describe('DELETE /products/:id', () => {
    beforeEach(() => {
      db.seed(Expense, [expense(1, NU), expense(2, NU), expense(3, OTRA)]);
      db.seed(CapitalPayment, [
        { id: 1, productId: NU, date: TODAY, amountCents: 1, expenseId: 1 },
        { id: 2, productId: OTRA, date: TODAY, amountCents: 1, expenseId: 3 },
      ]);
      db.seed(StatementCheck, [
        { id: 1, productId: NU, cutDate: '2026-10-22' },
        { id: 2, productId: OTRA, cutDate: '2026-10-22' },
      ]);
    });

    it('se lleva todo lo suyo y deja intactos los otros productos', async () => {
      await lifecycle.remove(NU);

      expect(db.rows(Product).map((p) => p.id)).toEqual([OTRA, AHORROS, PRESTAMO]);
      expect(db.rows(CreditCard).map((c) => c.productId)).toEqual([OTRA]);
      expect(countOf(Expense, 'sourceProductId', NU)).toBe(0);
      expect(countOf(CapitalPayment, 'productId', NU)).toBe(0);
      expect(countOf(StatementCheck, 'productId', NU)).toBe(0);
      expect(countOf(ProductRate, 'productId', NU)).toBe(0);
      // Lo de los demás sigue ahí
      expect(countOf(Expense, 'sourceProductId', OTRA)).toBe(1);
      expect(countOf(CapitalPayment, 'productId', OTRA)).toBe(1);
      expect(countOf(StatementCheck, 'productId', OTRA)).toBe(1);
      expect(countOf(ProductRate, 'productId', OTRA)).toBe(1);
      expect(countOf(AccountBalance, 'productId', AHORROS)).toBe(1);
    });

    it('borra también una cuenta con sus saldos y un préstamo con su tasa', async () => {
      await lifecycle.remove(AHORROS);
      await lifecycle.remove(PRESTAMO);
      expect(db.rows(Account)).toHaveLength(0);
      expect(db.rows(AccountBalance)).toHaveLength(0);
      expect(db.rows(Loan)).toHaveLength(0);
      expect(countOf(ProductRate, 'productId', PRESTAMO)).toBe(0);
    });

    it('404 si no existe', async () => {
      await expect(lifecycle.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('409 si un gasto fijo se paga con la tarjeta, y no se borra nada', async () => {
      db.seed(FixedExpense, [
        { id: 1, name: 'Arriendo', cardId: NU },
        { id: 2, name: 'Netflix', cardId: NU },
        { id: 3, name: 'Gimnasio', cardId: OTRA },
      ]);
      const error = await lifecycle.remove(NU).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(
        'Esta tarjeta paga 2 gastos fijos (Arriendo, Netflix). Cámbialos o elimínalos antes de eliminarla.',
      );
      expect(db.rows(Product)).toHaveLength(4);
      expect(countOf(Expense, 'sourceProductId', NU)).toBe(2);
    });

    it('409 si llega un ingreso a la cuenta, recurrente o puntual', async () => {
      db.seed(RecurringIncome, [{ id: 1, name: 'Salario', destinationAccountId: AHORROS }]);
      db.seed(OneOffIncome, [{ id: 1, description: 'Prima', destinationAccountId: AHORROS }]);

      await expect(lifecycle.remove(AHORROS)).rejects.toThrow(
        'A esta cuenta llegan 2 ingresos (Salario, Prima). Cámbialos o elimínalos antes de eliminarla.',
      );
      expect(db.rows(Product)).toHaveLength(4);
      expect(db.rows(AccountBalance)).toHaveLength(1);
    });

    it('409 si un gasto fijo sale de la cuenta, y el mensaje ofrece archivarla', async () => {
      db.seed(FixedExpense, [{ id: 1, name: 'Arriendo', cardId: null, accountId: AHORROS }]);

      await expect(lifecycle.remove(AHORROS)).rejects.toThrow(
        'De esta cuenta sale 1 gasto fijo (Arriendo). Cámbialo o elimínalo antes de eliminarla. O archívala para conservar su historial.',
      );
      expect((await lifecycle.usage(AHORROS)).blockers).toEqual([{ kind: 'fixed_expense', id: 1, name: 'Arriendo' }]);
      expect(db.rows(Account)).toHaveLength(1);
    });

    it('una cuenta con gastos fijos sí se archiva (cerrarla conserva el historial)', async () => {
      db.seed(FixedExpense, [{ id: 1, name: 'Arriendo', cardId: null, accountId: AHORROS }]);
      await expect(lifecycle.archive(AHORROS, TODAY)).resolves.toEqual({ id: AHORROS, active: false });
      expect(db.rows(FixedExpense)).toHaveLength(1);
    });

    it('si algo falla antes de terminar, no queda nada a medias', async () => {
      // Una transacción que lanza al final: el fake descarta todo lo escrito dentro
      const real = db.dataSource();
      const failing = {
        transaction: (work: (manager: EntityManager) => Promise<unknown>) =>
          real.transaction(async (manager) => {
            await work(manager);
            throw new Error('la base se cayó al terminar');
          }),
      } as unknown as typeof real;

      await expect(new ProductLifecycleService(failing, {} as CardPlanService).remove(NU)).rejects.toThrow('se cayó');
      expect(countOf(Expense, 'sourceProductId', NU)).toBe(2);
      expect(db.rows(Product)).toHaveLength(4);
    });
  });

  describe('GET /products/:id/usage', () => {
    it('cuenta lo que se borraría y lista lo que lo bloquea', async () => {
      db.seed(Expense, [expense(1, NU), expense(2, NU)]);
      db.seed(CapitalPayment, [{ id: 1, productId: NU, date: TODAY, amountCents: 1, expenseId: null }]);
      db.seed(FixedExpense, [{ id: 7, name: 'Arriendo', cardId: NU }]);

      expect(await lifecycle.usage(NU)).toEqual({
        expenses: 2,
        capitalPayments: 1,
        balances: 0,
        rates: 1,
        blockers: [{ kind: 'fixed_expense', id: 7, name: 'Arriendo' }],
      });
      expect((await lifecycle.usage(AHORROS)).balances).toBe(1);
    });

    it('404 si no existe', async () => {
      await expect(lifecycle.usage(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('archivar y desarchivar', () => {
    it('una tarjeta con deuda pendiente da 409 y sigue activa', async () => {
      await debt.replace(NU, { items: [{ amountCents: 3_933_883_00, installments: 12 }] }, TODAY);
      asInDb();

      const error = await lifecycle.archive(NU, TODAY).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toMatch(
        /^Todavía debes \$ 3\.933\.883 en esta tarjeta\. Archívala cuando la termines de pagar/,
      );
      expect(db.rows(Product).find((p) => p.id === NU)?.active).toBe(true);
    });

    it('una tarjeta sin deuda se archiva, sale de GET /cards y se puede desarchivar', async () => {
      expect(await lifecycle.archive(NU, TODAY)).toEqual({ id: NU, active: false });

      expect((await cards.listActive(TODAY)).map((c) => c.id)).toEqual([OTRA]);
      expect((await products.listActive()).map((p) => p.id)).not.toContain(NU);
      expect((await products.listArchived()).map((p) => p.id)).toEqual([NU]);

      expect(await lifecycle.unarchive(NU)).toEqual({ id: NU, active: true });
      expect((await cards.listActive(TODAY)).map((c) => c.id)).toEqual([NU, OTRA]);
      expect(await products.listArchived()).toEqual([]);
    });

    it('un préstamo con saldo da 409; uno ya pagado se archiva', async () => {
      await expect(lifecycle.archive(PRESTAMO, TODAY)).rejects.toThrow(/Todavía debes .* en este préstamo\. Archívalo/);
      // 12 cuotas desde el 10 dic 2026: pagado del todo después de la última
      await expect(lifecycle.archive(PRESTAMO, '2027-12-11')).resolves.toEqual({ id: PRESTAMO, active: false });
    });

    it('una cuenta con saldo sí se archiva y conserva su historial', async () => {
      await expect(lifecycle.archive(AHORROS, TODAY)).resolves.toEqual({ id: AHORROS, active: false });
      expect(db.rows(AccountBalance)).toHaveLength(1);
    });

    it('los mismos 409 que borrar si un gasto fijo o un ingreso lo usa', async () => {
      db.seed(FixedExpense, [{ id: 1, name: 'Netflix', cardId: NU }]);
      await expect(lifecycle.archive(NU, TODAY)).rejects.toThrow(
        'Esta tarjeta paga 1 gasto fijo (Netflix). Cámbialo o elimínalo antes de archivarla.',
      );
      db.seed(RecurringIncome, [{ id: 1, name: 'Salario', destinationAccountId: AHORROS }]);
      await expect(lifecycle.archive(AHORROS, TODAY)).rejects.toThrow(ConflictException);
    });

    it('404 si no existe', async () => {
      await expect(lifecycle.archive(999, TODAY)).rejects.toThrow(NotFoundException);
      await expect(lifecycle.unarchive(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('crear algo igual a un producto archivado', () => {
    it('409 que dice que lo desarchive; si el repetido está activo, el mensaje de siempre', async () => {
      db.unique.set(Product, [['kind', 'bank', 'last4']]);
      const input = {
        name: 'Nu 2',
        bank: 'Nu',
        last4: '1234',
        creditLimitCents: 100,
        cutDay: 22,
        dueDay: 4,
        rate: { effectiveFrom: '2026-01-01', ea: '0.3' },
      };

      await expect(cards.create(input)).rejects.toThrow('Ya existe una tarjeta de Nu terminada en 1234');
      await lifecycle.archive(NU, TODAY);
      await expect(cards.create(input)).rejects.toThrow('Ya tienes esta tarjeta archivada: desarchívala.');

      await lifecycle.archive(AHORROS, TODAY);
      await expect(
        new AccountsService(db.dataSource()).create({ name: 'Otra', bank: 'B', last4: '2222', accountType: 'savings' }),
      ).rejects.toThrow('Ya tienes esta cuenta archivada: desarchívala.');

      await expect(
        new LoansService(db.dataSource()).create({
          name: 'x',
          bank: 'B',
          last4: '3333',
          principalCents: 1,
          termMonths: 1,
          firstPaymentDate: '2027-01-01',
          rate: { effectiveFrom: '2026-01-01', ea: '0.2' },
        }),
      ).rejects.toThrow('Ya existe un préstamo de B terminado en 3333');
    });
  });
});

describe('la proyección ignora los productos archivados', () => {
  const TODAY_P = '2026-03-12';

  it('sin un archivado no cambia nada', () => {
    const f = facts();
    expect(excludeArchived(f, new Set())).toBe(f);
  });

  it('una cuenta archivada deja de sumar su saldo', () => {
    const f = facts();
    const withIt = buildProjection(f, 3, TODAY_P);
    const without = buildProjection(excludeArchived(f, new Set([P_AHORROS])), 3, TODAY_P);

    expect(withIt.openingBalanceCents).toBe(2_000_000_00);
    expect(without.openingBalanceCents).toBe(0);
  });

  it('una tarjeta archivada deja de contar su deuda, sus gastos y sus abonos', () => {
    const f = facts({ fixedExpenses: [] });
    const kept = excludeArchived(f, new Set([P_VISA]));

    expect(kept.cards).toHaveLength(0);
    expect(kept.rates.map((r) => r.productId)).not.toContain(P_VISA);
    expect(kept.expenses).toHaveLength(0);
    expect(kept.capitalPayments).toHaveLength(0);
    expect(buildProjection(kept, 4, TODAY_P).months.length).toBeGreaterThan(0);
  });
});
