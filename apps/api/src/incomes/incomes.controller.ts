import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
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

/** Cada POST/PATCH responde con solo el id (el POST con 201); DELETE responde 204 sin cuerpo. */
@Controller()
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Post('recurring-incomes')
  async createRecurringIncome(@Body() dto: CreateRecurringIncomeDto): Promise<{ id: number }> {
    const { id } = await this.incomes.createRecurringIncome(dto);
    return { id };
  }

  /** Todos, con su `status`; `?status=active|upcoming|ended` deja solo ese grupo. */
  @Get('recurring-incomes')
  listRecurringIncomes(@Query() query: ListMonthlyQuery): Promise<RecurringIncomeSummary[]> {
    return this.incomes.listRecurringIncomes(filterOf(query));
  }

  @Patch('recurring-incomes/:id')
  updateRecurringIncome(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecurringIncomeDto,
  ): Promise<{ id: number }> {
    return this.incomes.updateRecurringIncome(id, dto);
  }

  /** Quita la fecha de fin. 200 con el registro; 409 si lo reemplazó un cambio de monto. */
  @Post('recurring-incomes/:id/reactivate')
  @HttpCode(200)
  reactivateRecurringIncome(@Param('id', ParseIntPipe) id: number): Promise<RecurringIncomeSummary> {
    return this.incomes.reactivateRecurringIncome(id);
  }

  @Post('recurring-incomes/:id/amount-changes')
  changeRecurringIncomeAmount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmountChangeDto,
  ): Promise<{ id: number }> {
    return this.incomes.changeRecurringIncomeAmount(id, dto);
  }

  @Delete('recurring-incomes/:id')
  @HttpCode(204)
  removeRecurringIncome(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.incomes.removeRecurringIncome(id);
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

  @Get('fixed-expenses')
  listFixedExpenses(@Query() query: ListMonthlyQuery): Promise<FixedExpenseSummary[]> {
    return this.incomes.listFixedExpenses(filterOf(query));
  }

  @Patch('fixed-expenses/:id')
  updateFixedExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedExpenseDto,
  ): Promise<{ id: number }> {
    return this.incomes.updateFixedExpense(id, dto);
  }

  @Post('fixed-expenses/:id/reactivate')
  @HttpCode(200)
  reactivateFixedExpense(@Param('id', ParseIntPipe) id: number): Promise<FixedExpenseSummary> {
    return this.incomes.reactivateFixedExpense(id);
  }

  @Post('fixed-expenses/:id/amount-changes')
  changeFixedExpenseAmount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmountChangeDto,
  ): Promise<{ id: number }> {
    return this.incomes.changeFixedExpenseAmount(id, dto);
  }

  @Delete('fixed-expenses/:id')
  @HttpCode(204)
  removeFixedExpense(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.incomes.removeFixedExpense(id);
  }
}

function filterOf(query: ListMonthlyQuery): ListFilter {
  return query.status === undefined ? {} : { status: query.status };
}
