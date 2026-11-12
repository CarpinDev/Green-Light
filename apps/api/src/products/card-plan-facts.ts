import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import type { CardPlanFacts } from './build-card-plan';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { assertCardProduct } from './product-checks';

/** Las filas que necesitan el plan de una tarjeta y su deuda abonable. 404 si no existe, 400 si no es una tarjeta. */
export async function loadCardPlanFacts(db: DataSource, cardId: number): Promise<CardPlanFacts> {
  assertCardProduct(await db.getRepository(Product).findOneBy({ id: cardId }), cardId);
  const card = await db.getRepository(CreditCard).findOneBy({ productId: cardId });
  if (!card) throw new NotFoundException(`La tarjeta ${cardId} no tiene datos de tarjeta`);

  const [rates, expenses, capitalPayments, fixedExpenses] = await Promise.all([
    db.getRepository(ProductRate).find({ where: { productId: cardId } }),
    db.getRepository(Expense).find({ where: { sourceProductId: cardId } }),
    db.getRepository(CapitalPayment).find({ where: { productId: cardId } }),
    db.getRepository(FixedExpense).find(),
  ]);
  return { card, rates, expenses, capitalPayments, fixedExpenses };
}
