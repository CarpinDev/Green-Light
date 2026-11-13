import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../common/pg-errors';
import type { CategoryKind } from './category-kind';
import { Category } from './entities/category.entity';

export interface CreateCategoryInput {
  name: string;
  kind: CategoryKind;
}

/** Lo que la app necesita para elegir una categoría. */
export interface CategorySummary {
  id: number;
  name: string;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly dataSource: DataSource) {}

  /** Las categorías del usuario de un tipo, ordenadas por nombre. */
  async list(userId: number, kind: CategoryKind): Promise<CategorySummary[]> {
    const categories = await this.dataSource
      .getRepository(Category)
      .find({ where: { userId, kind }, order: { name: 'ASC' } });
    return categories.map(({ id, name }) => ({ id, name }));
  }

  /**
   * Crea una categoría del usuario. El mismo nombre puede existir una vez como gasto y otra como ingreso, y cada
   * persona tiene las suyas: el 409 solo habla de las propias.
   */
  async create(userId: number, input: CreateCategoryInput): Promise<Category> {
    try {
      return await this.dataSource.getRepository(Category).save({ userId, name: input.name, kind: input.kind });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Ya existe la categoría "${input.name}" de ${input.kind === 'expense' ? 'gasto' : 'ingreso'}`,
        );
      }
      throw err;
    }
  }
}
