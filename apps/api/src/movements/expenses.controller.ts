import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** Responde 201 con solo el id. 404 si el producto de origen no es tuyo. */
  @Post('expenses')
  async create(@CurrentUser() userId: number, @Body() dto: CreateExpenseDto): Promise<{ id: number }> {
    const { id } = await this.expenses.create(userId, dto);
    return { id };
  }
}
