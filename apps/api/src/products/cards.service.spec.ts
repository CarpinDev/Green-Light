import { BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CardsService, type CreateCardInput } from './cards.service';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import type { EntityClass } from '../testing/fake-db';

// Va en apps/api/src/products/. Prueba el service sin Postgres: un DataSource falso guarda en
// memoria y respeta lo que importa de una transacción (si algo falla, no queda nada).
// El service debe escribir con el manager que recibe en dataSource.transaction(...),
// usando manager.save(Entidad, datos) o manager.save(manager.create(Entidad, datos)).

type Row = Record<string, unknown>;

class FakeDb {
  tables = new Map<EntityClass, Row[]>();
  failOn?: EntityClass;
  private nextId = 1;

  rows<T extends object>(entity: new () => T): T[] {
    return (this.tables.get(entity) ?? []) as T[];
  }

  dataSource(): DataSource {
    return {
      transaction: async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
        const staged = new Map<EntityClass, Row[]>();
        for (const [k, v] of this.tables) staged.set(k, [...v]);
        const result = await work(this.manager(staged));
        this.tables = staged; // commit solo si work no lanzó
        return result;
      },
      // Para saber si el producto repetido está archivado (aquí nunca lo está)
      getRepository: () => ({ findOneBy: () => Promise.resolve(null) }),
    } as unknown as DataSource;
  }

  private manager(staged: Map<EntityClass, Row[]>): EntityManager {
    const save = async (a: unknown, b?: Row) => {
      const entity = (typeof a === 'function' ? Object.assign(new (a as new () => object)(), b) : a) as Row;
      const type = entity.constructor as EntityClass;
      if (type === this.failOn) throw new Error('la base se cayó');
      const list = staged.get(type) ?? [];
      if (
        type === Product &&
        list.some((p) => p.kind === entity.kind && p.bank === entity.bank && p.last4 === entity.last4)
      ) {
        throw new QueryFailedError(
          'INSERT INTO "product" ...',
          [],
          Object.assign(new Error('duplicate key value'), { code: '23505' }),
        );
      }
      if (type !== CreditCard && entity.id === undefined) entity.id = this.nextId++;
      staged.set(type, [...list, entity]);
      return entity;
    };
    const create = (Entity: new () => object, data: Row) => Object.assign(new Entity(), data);
    return { save, create } as unknown as EntityManager;
  }
}

const input = (overrides: Partial<CreateCardInput> = {}): CreateCardInput => ({
  name: 'Visa Ficticia',
  bank: 'Banco Ejemplo',
  last4: '4321',
  creditLimitCents: 500_000_000,
  cutDay: 15,
  dueDay: 5,
  rate: { effectiveFrom: '2026-01-01', ea: '0.2899' },
  ...overrides,
});

describe('CardsService.create', () => {
  let db: FakeDb;
  let service: CardsService;

  beforeEach(() => {
    db = new FakeDb();
    service = new CardsService(db.dataSource());
  });

  it('escribe product (kind credit_card), credit_card y su primera tasa, enlazados por el id', async () => {
    const created = await service.create(input());

    const [product] = db.rows(Product);
    expect(product).toMatchObject({ kind: 'credit_card', name: 'Visa Ficticia', bank: 'Banco Ejemplo', last4: '4321' });
    expect(db.rows(CreditCard)[0]).toMatchObject({
      productId: product.id,
      creditLimitCents: 500_000_000,
      cutDay: 15,
      dueDay: 5,
    });
    const [rate] = db.rows(ProductRate);
    expect(rate).toMatchObject({ productId: product.id, effectiveFrom: '2026-01-01', source: 'ea' });
    expect(rate.ea.equals(new Decimal('0.2899'))).toBe(true);

    expect(created.id).toBe(product.id);
  });

  it('pasa los campos opcionales que vengan', async () => {
    await service.create(input({ handlingFeeCents: 3_000_000, firstPeriodInterest: 'full_month' }));
    expect(db.rows(CreditCard)[0]).toMatchObject({ handlingFeeCents: 3_000_000, firstPeriodInterest: 'full_month' });
  });

  it('si falla una escritura no queda nada a medias', async () => {
    db.failOn = ProductRate;
    await expect(service.create(input())).rejects.toThrow();
    expect(db.rows(Product)).toHaveLength(0);
    expect(db.rows(CreditCard)).toHaveLength(0);
  });

  it('una tasa inválida es un 400 y no toca la base', async () => {
    await expect(
      service.create(input({ rate: { effectiveFrom: '2026-01-01', ea: '0.2899', mv: '0.0241' } })),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(Product)).toHaveLength(0);
  });

  it('misma tarjeta (banco + últimos 4) dos veces: 409, no un 500', async () => {
    await service.create(input());
    await expect(service.create(input({ name: 'Otra' }))).rejects.toThrow(ConflictException);
  });

  it('otros errores de la base no se disfrazan de 409', async () => {
    db.failOn = Product;
    await expect(service.create(input())).rejects.not.toThrow(ConflictException);
  });
});
