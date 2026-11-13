import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Account } from './entities/account.entity';
import { Product } from './entities/product.entity';
import type { ProductKind } from './product-kind';

/**
 * La cuenta de destino de un ingreso debe ser una cuenta DEL USUARIO (un préstamo o una tarjeta no sirven). Si es de
 * otra persona, la respuesta es igual a la de una que no existe: 404, para no revelar que existe.
 */
export async function assertAccountExists(dataSource: DataSource, userId: number, accountId: number): Promise<void> {
  const product = await dataSource.getRepository(Product).findOneBy({ id: accountId, userId });
  if (!product) throw new NotFoundException(`La cuenta ${accountId} no existe`);
  // Un producto tuyo que no es una cuenta (tarjeta, préstamo) sí se puede nombrar: es un error de quien pide
  const account = await dataSource.getRepository(Account).findOneBy({ productId: accountId });
  if (!account) throw new BadRequestException(`El producto ${accountId} no es una cuenta`);
}

/** Un gasto fijo con tarjeta necesita una tarjeta del usuario que exista y esté activa (de otro: 404). */
export async function assertActiveCard(dataSource: DataSource, userId: number, cardId: number): Promise<void> {
  const product = await dataSource.getRepository(Product).findOneBy({ id: cardId, userId });
  if (!product) throw new NotFoundException(`La tarjeta ${cardId} no existe`);
  if (product.kind !== 'credit_card') {
    throw new BadRequestException(`El producto ${cardId} no es una tarjeta de crédito`);
  }
  if (!product.active) {
    throw new BadRequestException(`La tarjeta ${cardId} está desactivada`);
  }
}

/** El producto debe existir y ser un préstamo; si no, 404 (para una pantalla de préstamo, otro tipo es "no existe"). */
export function assertLoanProduct(product: Product | null, id: number): void {
  if (!product || product.kind !== 'loan') throw new NotFoundException(`El préstamo ${id} no existe`);
}

/** El producto debe existir (404) y ser una tarjeta (400): para lo que solo tiene sentido con tarjetas. */
export function assertCardProduct(product: Product | null, id: number): void {
  if (!product) throw new NotFoundException(`La tarjeta ${id} no existe`);
  if (product.kind !== 'credit_card') throw new BadRequestException(`El producto ${id} no es una tarjeta de crédito`);
}

const ARCHIVED_HINT: Record<ProductKind, string> = {
  credit_card: 'Ya tienes esta tarjeta archivada: desarchívala.',
  account: 'Ya tienes esta cuenta archivada: desarchívala.',
  loan: 'Ya tienes este préstamo archivado: desarchívalo.',
};

/**
 * El 409 de un producto repetido (mismo tipo, banco y últimos 4). Si el que choca está archivado, el mensaje dice
 * que lo desarchive en lugar de crear otro; `fallback` es el mensaje de siempre.
 */
export async function duplicateProductError(
  dataSource: DataSource,
  userId: number,
  kind: ProductKind,
  bank: string,
  last4: string,
  fallback: string,
): Promise<ConflictException> {
  const existing = await dataSource.getRepository(Product).findOneBy({ userId, kind, bank, last4 });
  return new ConflictException(existing && !existing.active ? ARCHIVED_HINT[kind] : fallback);
}
