import { Injectable } from '@nestjs/common';
import type { Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { assertDateRange } from '../common/dates';
import { assertCategoryOfKind } from '../movements/category-check';
import { assertAccountExists, assertActiveCard } from '../products/product-checks';
import { FixedExpense } from './entities/fixed-expense.entity';
import { OneOffIncome } from './entities/one-off-income.entity';
import { RecurringIncome } from './entities/recurring-income.entity';

export interface CreateRecurringIncomeInput {
  name: string;
  amountCents: Cents;
  /** 1..31; si el mes es más corto se usa el último día. */
  dayOfMonth: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  destinationAccountId?: number;
}

export interface CreateOneOffIncomeInput {
  date: IsoDate;
  amountCents: Cents;
  description?: string;
  /** Debe ser una categoría de ingreso (la regla inversa de la de gastos). */
  categoryId?: number;
  destinationAccountId?: number;
}

export interface CreateFixedExpenseInput {
  name: string;
  amountCents: Cents;
  dayOfMonth: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  /** Debe ser una categoría de gasto. */
  categoryId?: number;
  /** Si se paga con tarjeta: tiene que ser una tarjeta activa. Es una compra a 1 cuota cada mes. */
  cardId?: number;
}

/**
 * Ingresos y gastos que se repiten o son puntuales. Las reglas se validan antes de escribir,
 * con un 400 claro, sin esperar al CHECK ni a la FK de Postgres.
 */
@Injectable()
export class IncomesService {
  constructor(private readonly dataSource: DataSource) {}

  async createRecurringIncome(input: CreateRecurringIncomeInput): Promise<RecurringIncome> {
    assertDateRange(input.startDate, input.endDate);
    if (input.destinationAccountId !== undefined)
      await assertAccountExists(this.dataSource, input.destinationAccountId);

    return this.dataSource.getRepository(RecurringIncome).save({
      name: input.name,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.destinationAccountId !== undefined && { destinationAccountId: input.destinationAccountId }),
    });
  }

  async createOneOffIncome(input: CreateOneOffIncomeInput): Promise<OneOffIncome> {
    if (input.categoryId !== undefined) await assertCategoryOfKind(this.dataSource, input.categoryId, 'income');
    if (input.destinationAccountId !== undefined)
      await assertAccountExists(this.dataSource, input.destinationAccountId);

    return this.dataSource.getRepository(OneOffIncome).save({
      date: input.date,
      amountCents: input.amountCents,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.destinationAccountId !== undefined && { destinationAccountId: input.destinationAccountId }),
    });
  }

  async createFixedExpense(input: CreateFixedExpenseInput): Promise<FixedExpense> {
    assertDateRange(input.startDate, input.endDate);
    if (input.categoryId !== undefined) await assertCategoryOfKind(this.dataSource, input.categoryId, 'expense');
    if (input.cardId !== undefined) await assertActiveCard(this.dataSource, input.cardId);

    return this.dataSource.getRepository(FixedExpense).save({
      name: input.name,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.cardId !== undefined && { cardId: input.cardId }),
    });
  }
}
