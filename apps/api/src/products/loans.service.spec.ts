import { BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FakeDb } from '../testing/fake-db';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { LoansService, type CreateLoanInput } from './loans.service';

// Mismo patrón que CardsService: product + loan + primera tasa en una transacción. Datos ficticios.

const input = (overrides: Partial<CreateLoanInput> = {}): CreateLoanInput => ({
  name: 'Libre inversión',
  bank: 'Banco Ejemplo',
  last4: '9876',
  principalCents: 1_000_000_000,
  termMonths: 12,
  firstPaymentDate: '2026-02-10',
  rate: { effectiveFrom: '2026-01-01', ea: '0.195618' },
  ...overrides,
});

describe('LoansService.create', () => {
  let db: FakeDb;
  let service: LoansService;

  beforeEach(() => {
    db = new FakeDb();
    db.withoutId.add(Loan);
    db.unique.set(Product, [['kind', 'bank', 'last4']]);
    service = new LoansService(db.dataSource());
  });

  it('escribe product (kind loan), loan y su primera tasa, enlazados por el id', async () => {
    const created = await service.create(input());

    const [product] = db.rows(Product);
    expect(product).toMatchObject({ kind: 'loan', name: 'Libre inversión', bank: 'Banco Ejemplo', last4: '9876' });
    expect(db.rows(Loan)[0]).toMatchObject({
      productId: product?.id,
      principalCents: 1_000_000_000,
      termMonths: 12,
      firstPaymentDate: '2026-02-10',
    });
    const [rate] = db.rows(ProductRate);
    expect(rate).toMatchObject({ productId: product?.id, effectiveFrom: '2026-01-01', source: 'ea' });
    expect(rate?.ea.equals(new Decimal('0.195618'))).toBe(true);

    expect(created.id).toBe(product?.id);
  });

  it('sin cuota informada ni seguro: no escribe esos campos y la base usa sus defaults', async () => {
    await service.create(input());
    const [loan] = db.rows(Loan);
    // undefined (no null): TypeORM omite la columna y Postgres aplica su default
    expect(loan?.fixedPaymentCents).toBeUndefined();
    expect(loan?.insuranceCents).toBeUndefined();
  });

  it('pasa la cuota del banco, el seguro y el método cuando vienen', async () => {
    await service.create(
      input({ fixedPaymentCents: 91_679_993, insuranceCents: 1_200_000, method: 'constant_capital' }),
    );
    expect(db.rows(Loan)[0]).toMatchObject({
      fixedPaymentCents: 91_679_993,
      insuranceCents: 1_200_000,
      method: 'constant_capital',
    });
  });

  it('con E.A. y M.V. equivalentes guarda ambas con source = both', async () => {
    await service.create(input({ rate: { effectiveFrom: '2026-01-01', ea: '0.2899', mv: '0.0214' } }));
    expect(db.rows(ProductRate)[0]).toMatchObject({ source: 'both' });
  });

  it('si falla una escritura no queda nada a medias', async () => {
    db.failOn = ProductRate;
    await expect(service.create(input())).rejects.toThrow();
    expect(db.rows(Product)).toHaveLength(0);
    expect(db.rows(Loan)).toHaveLength(0);
  });

  it('una tasa inválida es un 400 y no toca la base', async () => {
    await expect(
      service.create(input({ rate: { effectiveFrom: '2026-01-01', ea: '0.2899', mv: '0.0241' } })),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(Product)).toHaveLength(0);
  });

  it('un préstamo repetido (banco + últimos 4): 409', async () => {
    await service.create(input());
    await expect(service.create(input({ name: 'Otro' }))).rejects.toThrow(ConflictException);
    expect(db.rows(Product)).toHaveLength(1);
  });

  it('el mismo banco y últimos 4 que una tarjeta no es repetido: cambia el tipo', async () => {
    db.seed(Product, [{ id: 50, kind: 'credit_card', bank: 'Banco Ejemplo', last4: '9876' }]);
    await expect(service.create(input())).resolves.toBeDefined();
  });

  it('otros errores de la base no se disfrazan de 409', async () => {
    db.failOn = Product;
    await expect(service.create(input())).rejects.not.toThrow(ConflictException);
  });
});
