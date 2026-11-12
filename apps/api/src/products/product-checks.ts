import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Account } from './entities/account.entity';
import { Product } from './entities/product.entity';
import type { ProductKind } from './product-kind';

/** La cuenta de destino de un ingreso debe existir en Account (un préstamo o una tarjeta no sirven). */
export async function assertAccountExists(dataSource: DataSource, accountId: number): Promise<void> {
  const account = await dataSource.getRepository(Account).findOneBy({ productId: accountId });
  if (!account) throw new BadRequestException(`La cuenta ${accountId} no existe`);
}

/** Un gasto fijo con tarjeta necesita una tarjeta que exista y esté activa. */
export async function assertActiveCard(dataSource: DataSource, cardId: number): Promise<void> {
  const product = await dataSource.getRepository(Product).findOneBy({ id: cardId });
  if (!product || product.kind !== 'credit_card') {
    throw new BadRequestException(`El producto ${cardId} no es una tarjeta de crédito`);
  }
  if (!product.active) {
    throw new BadRequestException(`La tarjeta ${cardId} está desactivada`);
  }
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
  kind: ProductKind,
  bank: string,
  last4: string,
  fallback: string,
): Promise<ConflictException> {
  const existing = await dataSource.getRepository(Product).findOneBy({ kind, bank, last4 });
  return new ConflictException(existing && !existing.active ? ARCHIVED_HINT[kind] : fallback);
}
