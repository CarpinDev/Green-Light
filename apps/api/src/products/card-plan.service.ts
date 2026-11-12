import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { type CardPlan, buildCardPlan } from './build-card-plan';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { assertCardProduct } from './product-checks';

export const DEFAULT_CUTS = 6;
export const MAX_CUTS = 24;

/** Carga la tarjeta y sus filas y llama a buildCardPlan: aquí no hay ninguna regla de negocio. */
@Injectable()
export class CardPlanService {
  constructor(private readonly dataSource: DataSource) {}

  async plan(cardId: number, cuts: number = DEFAULT_CUTS, today = isoDateOf()): Promise<CardPlan> {
    const db = this.dataSource;
    assertCardProduct(await db.getRepository(Product).findOneBy({ id: cardId }), cardId);
    const card = await db.getRepository(CreditCard).findOneBy({ productId: cardId });
    if (!card) throw new NotFoundException(`La tarjeta ${cardId} no tiene datos de tarjeta`);

    const [rates, expenses, capitalPayments, fixedExpenses] = await Promise.all([
      db.getRepository(ProductRate).find({ where: { productId: cardId } }),
      db.getRepository(Expense).find({ where: { sourceProductId: cardId } }),
      db.getRepository(CapitalPayment).find({ where: { productId: cardId } }),
      db.getRepository(FixedExpense).find(),
    ]);
    return buildCardPlan({ card, rates, expenses, capitalPayments, fixedExpenses }, cuts, today);
  }
}
