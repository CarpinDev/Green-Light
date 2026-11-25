import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type Cents, type IsoDate, monthlyDates } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { isUniqueViolation } from '../common/pg-errors';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { assertAccountExists } from '../products/product-checks';
import { RecurringConfirmation } from './entities/recurring-confirmation.entity';

export interface CreateRecurringConfirmationInput {
  /** Uno de los dos: el ingreso recurrente o el gasto fijo. */
  recurringIncomeId?: number;
  fixedExpenseId?: number;
  /** La fecha esperada de esa ocurrencia (la clave de la confirmación). */
  scheduledDate: IsoDate;
  /** El día en que llegó o se pagó de verdad (no puede ser futuro). */
  actualDate: IsoDate;
  amountCents: Cents;
  /** La cuenta donde llegó (ingreso) o de donde salió (gasto). */
  accountId?: number;
}

/** Confirma que llegó un salario o se pagó un gasto fijo, con su fecha y monto reales. */
@Injectable()
export class RecurringConfirmationsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    userId: number,
    input: CreateRecurringConfirmationInput,
    today: IsoDate = isoDateOf(),
  ): Promise<RecurringConfirmation> {
    if ((input.recurringIncomeId === undefined) === (input.fixedExpenseId === undefined)) {
      throw new BadRequestException(
        'Indica un ingreso (recurringIncomeId) o un gasto fijo (fixedExpenseId), no los dos',
      );
    }
    if (input.actualDate > today) {
      throw new BadRequestException(`La fecha ${input.actualDate} todavía no llega: confírmalo cuando pase`);
    }

    const schedule =
      input.recurringIncomeId !== undefined
        ? await this.dataSource.getRepository(RecurringIncome).findOneBy({ id: input.recurringIncomeId, userId })
        : await this.dataSource.getRepository(FixedExpense).findOneBy({ id: input.fixedExpenseId, userId });
    if (!schedule) throw new NotFoundException('Ese ingreso o gasto fijo no existe');
    if ('cardId' in schedule && schedule.cardId !== null) {
      throw new BadRequestException('Un gasto fijo con tarjeta no se confirma: se paga en el extracto de la tarjeta');
    }

    // La misma regla de fechas que usa la proyección: el día 31 de un mes corto cae igual aquí y allá
    const date = input.scheduledDate;
    const expected = monthlyDates(schedule.dayOfMonth, schedule.startDate, schedule.endDate ?? undefined, date, date);
    if (!expected.includes(date)) {
      throw new BadRequestException(`El ${date} no es una fecha en la que esto se espere`);
    }
    if (input.accountId !== undefined) await assertAccountExists(this.dataSource, userId, input.accountId);

    const key = {
      userId,
      scheduledDate: date,
      ...(input.recurringIncomeId !== undefined && { recurringIncomeId: input.recurringIncomeId }),
      ...(input.fixedExpenseId !== undefined && { fixedExpenseId: input.fixedExpenseId }),
    };
    const repo = this.dataSource.getRepository(RecurringConfirmation);
    const duplicated = () => new ConflictException('Esa fecha ya está confirmada, bórrala para corregirla');
    if (await repo.findOneBy(key)) throw duplicated();

    try {
      return await repo.save({
        ...key,
        actualDate: input.actualDate,
        amountCents: input.amountCents,
        ...(input.accountId !== undefined && { accountId: input.accountId }),
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicated();
      throw err;
    }
  }

  async remove(userId: number, id: number): Promise<void> {
    const { affected } = await this.dataSource.getRepository(RecurringConfirmation).delete({ id, userId });
    if (!affected) throw new NotFoundException(`La confirmación ${id} no existe`);
  }
}
