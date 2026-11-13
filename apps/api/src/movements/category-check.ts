import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CategoryKind } from './category-kind';
import { Category } from './entities/category.entity';

const LABEL: Record<CategoryKind, string> = { expense: 'gasto', income: 'ingreso' };

/**
 * La categoría debe ser del usuario y del tipo esperado: los gastos usan las de gasto, los ingresos las de ingreso.
 * La categoría de otra persona responde igual que una que no existe.
 */
export async function assertCategoryOfKind(
  dataSource: DataSource,
  userId: number,
  categoryId: number,
  expected: CategoryKind,
): Promise<void> {
  const category = await dataSource.getRepository(Category).findOneBy({ id: categoryId, userId });
  if (!category) throw new BadRequestException(`La categoría ${categoryId} no existe`);
  if (category.kind !== expected) {
    throw new BadRequestException(
      `La categoría ${categoryId} es de ${LABEL[category.kind]}: aquí se necesita una categoría de ${LABEL[expected]}`,
    );
  }
}
