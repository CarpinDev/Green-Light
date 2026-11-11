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

    it('la misma fecha dos veces: 409', async () => {
      await service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 1 });
      await expect(service.confirmBalance(accountId, { asOf: '2026-04-01', balanceCents: 2 })).rejects.toThrow(
        ConflictException,
      );
      expect(db.rows(AccountBalance)).toHaveLength(1);
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
