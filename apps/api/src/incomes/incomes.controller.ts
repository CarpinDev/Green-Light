import { Body, Controller, Post } from '@nestjs/common';
import {
  CreateFixedExpenseDto,
  CreateOneOffIncomeDto,
  CreateRecurringIncomeDto,
} from './dto/incomes.dto';
import { IncomesService } from './incomes.service';

/** Cada POST responde 201 con solo el id. */
@Controller()
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Post('recurring-incomes')
  async createRecurringIncome(@Body() dto: CreateRecurringIncomeDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createRecurringIncome(dto);
    return { id };
  }

  @Post('one-off-incomes')
  async createOneOffIncome(@Body() dto: CreateOneOffIncomeDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createOneOffIncome(dto);
    return { id };
  }

  @Post('fixed-expenses')
  async createFixedExpense(@Body() dto: CreateFixedExpenseDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createFixedExpense(dto);
    return { id };
  }
}
