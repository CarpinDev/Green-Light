import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Account } from './entities/account.entity';
import { Product } from './entities/product.entity';

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
