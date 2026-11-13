import { Body, Controller, Delete, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
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

  /** Corrige la promoción y las cuotas de una compra con tarjeta. 404 si no existe o no es tuya. */
  @Patch('expenses/:id')
  async update(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ): Promise<{ id: number }> {
    await this.expenses.update(userId, id, dto);
    return { id };
  }

  /** Borra un gasto mal puesto. 204; 404 si no existe o no es tuyo; 400 si es deuda inicial; 409 si tiene abonos. */
  @Delete('expenses/:id')
  @HttpCode(204)
  remove(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.expenses.remove(userId, id);
  }
}
