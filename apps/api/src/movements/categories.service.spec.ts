import { ConflictException } from '@nestjs/common';
import { FakeDb } from '../testing/fake-db';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

describe('CategoriesService.create', () => {
  let db: FakeDb;
  let service: CategoriesService;

  beforeEach(() => {
    db = new FakeDb();
    db.unique.set(Category, [['name', 'kind']]);
    service = new CategoriesService(db.dataSource());
  });

  it('guarda la categoría y devuelve su id', async () => {
    const { id } = await service.create({ name: 'Mercado', kind: 'expense' });
    expect(db.rows(Category)[0]).toMatchObject({ id, name: 'Mercado', kind: 'expense' });
  });

  it('el mismo nombre con el mismo tipo: 409', async () => {
    await service.create({ name: 'Mercado', kind: 'expense' });
    await expect(service.create({ name: 'Mercado', kind: 'expense' })).rejects.toThrow(ConflictException);
    expect(db.rows(Category)).toHaveLength(1);
  });

  it('el mismo nombre con otro tipo sí se puede (Salario como gasto y como ingreso)', async () => {
    await service.create({ name: 'Otros', kind: 'expense' });
    await expect(service.create({ name: 'Otros', kind: 'income' })).resolves.toBeDefined();
    expect(db.rows(Category)).toHaveLength(2);
  });

  it('otros errores de la base no se disfrazan de 409', async () => {
    db.failOn = Category;
    await expect(service.create({ name: 'X', kind: 'expense' })).rejects.not.toThrow(ConflictException);
  });
});
