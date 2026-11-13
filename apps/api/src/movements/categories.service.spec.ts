import { ConflictException } from '@nestjs/common';
import { FakeDb } from '../testing/fake-db';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { USER } from '../testing/users';

describe('CategoriesService.create', () => {
  let db: FakeDb;
  let service: CategoriesService;

  beforeEach(() => {
    db = new FakeDb();
    db.unique.set(Category, [['userId', 'name', 'kind']]);
    service = new CategoriesService(db.dataSource());
  });

  it('guarda la categoría y devuelve su id', async () => {
    const { id } = await service.create(USER, { name: 'Mercado', kind: 'expense' });
    expect(db.rows(Category)[0]).toMatchObject({ id, name: 'Mercado', kind: 'expense' });
  });

  it('el mismo nombre con el mismo tipo: 409', async () => {
    await service.create(USER, { name: 'Mercado', kind: 'expense' });
    await expect(service.create(USER, { name: 'Mercado', kind: 'expense' })).rejects.toThrow(ConflictException);
    expect(db.rows(Category)).toHaveLength(1);
  });

  it('el mismo nombre con otro tipo sí se puede (Salario como gasto y como ingreso)', async () => {
    await service.create(USER, { name: 'Otros', kind: 'expense' });
    await expect(service.create(USER, { name: 'Otros', kind: 'income' })).resolves.toBeDefined();
    expect(db.rows(Category)).toHaveLength(2);
  });

  it('otros errores de la base no se disfrazan de 409', async () => {
    db.failOn = Category;
    await expect(service.create(USER, { name: 'X', kind: 'expense' })).rejects.not.toThrow(ConflictException);
  });
});

describe('CategoriesService.list', () => {
  let db: FakeDb;
  let service: CategoriesService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Category, [
      { id: 1, name: 'Transporte', kind: 'expense' },
      { id: 2, name: 'Salario', kind: 'income' },
      { id: 3, name: 'Mercado', kind: 'expense' },
    ]);
    service = new CategoriesService(db.dataSource());
  });

  it('devuelve solo las del tipo pedido, ordenadas por nombre', async () => {
    expect(await service.list(USER, 'expense')).toEqual([
      { id: 3, name: 'Mercado' },
      { id: 1, name: 'Transporte' },
    ]);
    expect(await service.list(USER, 'income')).toEqual([{ id: 2, name: 'Salario' }]);
  });

  it('sin categorías de ese tipo devuelve una lista vacía', async () => {
    db = new FakeDb();
    expect(await new CategoriesService(db.dataSource()).list(USER, 'expense')).toEqual([]);
  });
});
