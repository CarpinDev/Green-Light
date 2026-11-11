import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FakeDb } from '../testing/fake-db';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { Product } from './entities/product.entity';
import { AccountsService, type CreateAccountInput } from './accounts.service';

// Cuentas y sus saldos confirmados. Datos ficticios.

const input = (overrides: Partial<CreateAccountInput> = {}): CreateAccountInput => ({
  name: 'Ahorros',
  bank: 'Banco Ejemplo',
  last4: '1357',
  accountType: 'savings',
  ...overrides,
});

describe('AccountsService', () => {
  let db: FakeDb;
  let service: AccountsService;

  beforeEach(() => {
    db = new FakeDb();
    db.withoutId.add(Account);
    db.unique.set(Product, [['kind', 'bank', 'last4']]);
    db.unique.set(AccountBalance, [['productId', 'asOf']]);
    service = new AccountsService(db.dataSource());
  });

  describe('create', () => {
    it('escribe product (kind account) y account, enlazados por el id', async () => {
      const created = await service.create(input());

      const [product] = db.rows(Product);
      expect(product).toMatchObject({ kind: 'account', name: 'Ahorros', bank: 'Banco Ejemplo', last4: '1357' });
      expect(db.rows(Account)[0]).toMatchObject({ productId: product?.id, accountType: 'savings' });
      expect(created.id).toBe(product?.id);
    });

    it('sin saldo inicial no escribe ninguna fila de saldo', async () => {
      await service.create(input());
      expect(db.rows(AccountBalance)).toHaveLength(0);
    });

    it('con saldo inicial agrega la primera fila de saldo con su fecha', async () => {
      await service.create(input({ openingBalanceCents: 250_000_000, asOf: '2026-03-10' }));
      expect(db.rows(AccountBalance)[0]).toMatchObject({
        productId: db.rows(Product)[0]?.id,
        asOf: '2026-03-10',
        balanceCents: 250_000_000,
      });
    });

    it('el saldo inicial puede ser negativo (sobregiro) o cero', async () => {
      await service.create(input({ openingBalanceCents: -5_000_000, asOf: '2026-03-10' }));
      await service.create(input({ last4: '2468', openingBalanceCents: 0, asOf: '2026-03-10' }));
      expect(db.rows(AccountBalance).map((b) => b.balanceCents)).toEqual([-5_000_000, 0]);
    });

    it('saldo sin fecha, o fecha sin saldo: 400 y no escribe nada', async () => {
      await expect(service.create(input({ openingBalanceCents: 100 }))).rejects.toThrow(BadRequestException);
      await expect(service.create(input({ asOf: '2026-03-10' }))).rejects.toThrow(BadRequestException);
      expect(db.rows(Product)).toHaveLength(0);
    });

    it('si falla la escritura del saldo no queda nada a medias', async () => {
      db.failOn = AccountBalance;
      await expect(service.create(input({ openingBalanceCents: 100, asOf: '2026-03-10' }))).rejects.toThrow();
      expect(db.rows(Product)).toHaveLength(0);
      expect(db.rows(Account)).toHaveLength(0);
    });

    it('una cuenta repetida (banco + últimos 4): 409', async () => {
      await service.create(input());
      await expect(service.create(input({ name: 'Otra' }))).rejects.toThrow(ConflictException);
    });
  });

  describe('listActive', () => {
    // El default active = true lo pone Postgres; la base falsa no lo conoce
    const activate = () =>
      db.seed(
        Product,
        db.rows(Product).map((p) => ({ ...p, active: p.active ?? true })),
      );

    it('devuelve cada cuenta con su saldo más reciente, por nombre', async () => {
      const b = (await service.create(input({ name: 'Nómina', last4: '2468' }))).id;
      const a = (await service.create(input({ name: 'Ahorros' }))).id;
      await service.confirmBalance(a, { asOf: '2026-04-01', balanceCents: 100 });
      await service.confirmBalance(a, { asOf: '2026-10-02', balanceCents: 300 });
      await service.confirmBalance(a, { asOf: '2026-06-15', balanceCents: 200 });
      await service.confirmBalance(b, { asOf: '2026-09-01', balanceCents: -50 });

      activate();

      expect(await service.listActive()).toEqual([
        {
          id: a,
          name: 'Ahorros',
          bank: 'Banco Ejemplo',
          last4: '1357',
          latestBalance: { asOf: '2026-10-02', balanceCents: 300 },
        },
        {
          id: b,
          name: 'Nómina',
          bank: 'Banco Ejemplo',
          last4: '2468',
          latestBalance: { asOf: '2026-09-01', balanceCents: -50 },
        },
      ]);
    });

    it('una cuenta sin saldos trae latestBalance null', async () => {
      await service.create(input());
      activate();
      expect((await service.listActive())[0]?.latestBalance).toBeNull();
    });

    it('solo cuentas activas: ni inactivas, ni tarjetas, ni préstamos', async () => {
      const id = (await service.create(input())).id;
      activate();
      db.seed(Product, [
        ...db.rows(Product),
        { id: 70, kind: 'account', name: 'Vieja', bank: 'B', last4: '1111', active: false },
        { id: 71, kind: 'credit_card', name: 'Visa', bank: 'B', last4: '2222', active: true },
        { id: 72, kind: 'loan', name: 'Préstamo', bank: 'B', last4: '3333', active: true },
      ]);
      expect((await service.listActive()).map((a) => a.id)).toEqual([id]);
    });

    it('sin cuentas devuelve una lista vacía', async () => {
      expect(await service.listActive()).toEqual([]);
    });
  });

  describe('confirmBalance', () => {
    let accountId: number;

    beforeEach(async () => {
      accountId = (await service.create(input())).id;
    });

    it('agrega el saldo confirmado y devuelve su id', async () => {
      const saved = await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 300_000_000 });
      expect(saved.id).toBeDefined();
      expect(db.rows(AccountBalance)[0]).toMatchObject({
        productId: accountId,
        asOf: '2026-04-01',
        balanceCents: 300_000_000,
      });
    });

    it('acepta un saldo negativo', async () => {
      await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: -1_000_000 });
      expect(db.rows(AccountBalance)[0]?.balanceCents).toBe(-1_000_000);
    });

    it('fechas distintas conviven', async () => {
      await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 1 });
      await service.confirmBalance(accountId, { asOf: '2026-05-01', balanceCents: 2 });
      expect(db.rows(AccountBalance)).toHaveLength(2);
    });

    it('la misma fecha dos veces: reemplaza el saldo en vez de fallar', async () => {
      const first = await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 1 });
      const second = await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 2 });

      expect(db.rows(AccountBalance)).toHaveLength(1);
      expect(db.rows(AccountBalance)[0]).toMatchObject({ asOf: '2026-04-01', balanceCents: 2 });
      expect(second.id).toBe(first.id);
    });

    it('reemplazar el saldo de un día no toca el de otro día ni el de otra cuenta', async () => {
      const other = (await service.create(input({ last4: '2468' }))).id;
      await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 10 });
      await service.confirmBalance(accountId, { asOf: '2026-04-02', balanceCents: 20 });
      await service.confirmBalance(other, { asOf: '2026-04-01', balanceCents: 30 });

      await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 11 });

      const byKey = db.rows(AccountBalance).map((b) => `${b.productId}|${b.asOf}|${b.balanceCents}`);
      expect(byKey).toEqual([`${accountId}|2026-04-01|11`, `${accountId}|2026-04-02|20`, `${other}|2026-04-01|30`]);
    });

    it('un id que no existe: 404', async () => {
      await expect(service.confirmBalance(999, { asOf: '2026-04-01', balanceCents: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('un producto que existe pero no es una cuenta (una tarjeta): 404', async () => {
      db.seed(Product, [...db.rows(Product), { id: 70, kind: 'credit_card' }]);
      await expect(service.confirmBalance(70, { asOf: '2026-04-01', balanceCents: 1 })).rejects.toThrow(
        NotFoundException,
      );
      expect(db.rows(AccountBalance)).toHaveLength(0);
    });
  });
});
