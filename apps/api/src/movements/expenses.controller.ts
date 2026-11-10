import { Body, Controller, Post } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** Responde 201 con solo el id. */
  @Post('expenses')
  async create(@Body() dto: CreateExpenseDto): Promise<{ id: number }> {
    const { id } = await this.expenses.create(dto);
    return { id };
  }
}
