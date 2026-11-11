import { FakeDb } from '../testing/fake-db';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

// GET /products: lo que la app necesita para elegir de dónde sale un gasto. Datos ficticios.

describe('ProductsService.listActive', () => {
  let db: FakeDb;
  let service: ProductsService;

  beforeEach(() => {
    db = new FakeDb();
    service = new ProductsService(db.dataSource());
  });

  it('devuelve solo los productos activos', async () => {
    db.seed(Product, [
      { id: 1, kind: 'credit_card', name: 'Visa', bank: 'Banco Ejemplo', last4: '4321', active: true },
      { id: 2, kind: 'account', name: 'Ahorros vieja', bank: 'Banco Ejemplo', last4: '1111', active: false },
    ]);
    const products = await service.listActive();
    expect(products.map((p) => p.id)).toEqual([1]);
  });

  it('los ordena por nombre', async () => {
    db.seed(Product, [
      { id: 1, kind: 'loan', name: 'Préstamo', bank: 'B', last4: '3333', active: true },
      { id: 2, kind: 'account', name: 'Ahorros', bank: 'B', last4: '1111', active: true },
      { id: 3, kind: 'credit_card', name: 'Visa', bank: 'B', last4: '2222', active: true },
    ]);
    expect((await service.listActive()).map((p) => p.name)).toEqual(['Ahorros', 'Préstamo', 'Visa']);
  });

  it('solo trae lo que usa la app, incluido el tipo para saber si es tarjeta', async () => {
    db.seed(Product, [
      {
        id: 1,
        kind: 'credit_card',
        name: 'Visa',
        bank: 'Banco Ejemplo',
        last4: '4321',
        active: true,
        createdAt: new Date(),
      },
    ]);
    expect(await service.listActive()).toEqual([
      { id: 1, kind: 'credit_card', name: 'Visa', bank: 'Banco Ejemplo', last4: '4321' },
    ]);
  });

  it('sin productos devuelve una lista vacía', async () => {
    expect(await service.listActive()).toEqual([]);
  });
});
