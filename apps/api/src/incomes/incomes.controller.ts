import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  AmountChangeDto,
  CreateFixedExpenseDto,
  CreateOneOffIncomeDto,
  CreateRecurringIncomeDto,
  ListMonthlyQuery,
  UpdateFixedExpenseDto,
  UpdateRecurringIncomeDto,
} from './dto/incomes.dto';
import {
  type FixedExpenseSummary,
  IncomesService,
  type ListFilter,
  type RecurringIncomeSummary,
} from './incomes.service';

/**
 * Cada POST/PATCH responde con solo el id (el POST con 201); DELETE responde 204 sin cuerpo.
 * Todo es del usuario del token: el de otra persona responde 404, igual que uno que no existe.
 */
@Controller()
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Post('recurring-incomes')
  async createRecurringIncome(
    @CurrentUser() userId: number,
    @Body() dto: CreateRecurringIncomeDto,
  ): Promise<{ id: number }> {
    const { id } = await this.incomes.createRecurringIncome(userId, dto);
    return { id };
  }

  /** Todos, con su `status`; `?status=active|upcoming|ended` deja solo ese grupo. */
  @Get('recurring-incomes')
  listRecurringIncomes(
    @CurrentUser() userId: number,
    @Query() query: ListMonthlyQuery,
  ): Promise<RecurringIncomeSummary[]> {
    return this.incomes.listRecurringIncomes(userId, filterOf(query));
  }

  @Patch('recurring-incomes/:id')
  updateRecurringIncome(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecurringIncomeDto,
  ): Promise<{ id: number }> {
    return this.incomes.updateRecurringIncome(userId, id, dto);
  }

  /** Quita la fecha de fin. 200 con el registro; 409 si lo reemplazó un cambio de monto. */
  @Post('recurring-incomes/:id/reactivate')
  @HttpCode(200)
  reactivateRecurringIncome(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RecurringIncomeSummary> {
    return this.incomes.reactivateRecurringIncome(userId, id);
  }

  @Post('recurring-incomes/:id/amount-changes')
  changeRecurringIncomeAmount(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmountChangeDto,
  ): Promise<{ id: number }> {
    return this.incomes.changeRecurringIncomeAmount(userId, id, dto);
  }

  @Delete('recurring-incomes/:id')
  @HttpCode(204)
  removeRecurringIncome(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.incomes.removeRecurringIncome(userId, id);
  }

  @Post('one-off-incomes')
  async createOneOffIncome(@CurrentUser() userId: number, @Body() dto: CreateOneOffIncomeDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createOneOffIncome(userId, dto);
    return { id };
  }

  @Post('fixed-expenses')
  async createFixedExpense(@CurrentUser() userId: number, @Body() dto: CreateFixedExpenseDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createFixedExpense(userId, dto);
    return { id };
  }

  @Get('fixed-expenses')
  listFixedExpenses(@CurrentUser() userId: number, @Query() query: ListMonthlyQuery): Promise<FixedExpenseSummary[]> {
    return this.incomes.listFixedExpenses(userId, filterOf(query));
  }

  @Patch('fixed-expenses/:id')
  updateFixedExpense(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedExpenseDto,
  ): Promise<{ id: number }> {
    return this.incomes.updateFixedExpense(userId, id, dto);
  }

  @Post('fixed-expenses/:id/reactivate')
  @HttpCode(200)
  reactivateFixedExpense(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<FixedExpenseSummary> {
    return this.incomes.reactivateFixedExpense(userId, id);
  }

  @Post('fixed-expenses/:id/amount-changes')
  changeFixedExpenseAmount(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmountChangeDto,
  ): Promise<{ id: number }> {
    return this.incomes.changeFixedExpenseAmount(userId, id, dto);
  }

  @Delete('fixed-expenses/:id')
  @HttpCode(204)
  removeFixedExpense(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.incomes.removeFixedExpense(userId, id);
  }
}

function filterOf(query: ListMonthlyQuery): ListFilter {
  return query.status === undefined ? {} : { status: query.status };
}
