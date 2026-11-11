import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../common/pg-errors';
import type { CategoryKind } from './category-kind';
import { Category } from './entities/category.entity';

export interface CreateCategoryInput {
  name: string;
  kind: CategoryKind;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea una categoría. El mismo nombre puede existir una vez como gasto y otra como ingreso. */
  async create(input: CreateCategoryInput): Promise<Category> {
    try {
      return await this.dataSource.getRepository(Category).save({ name: input.name, kind: input.kind });
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
