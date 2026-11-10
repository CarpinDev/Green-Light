import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FixedExpense } from './entities/fixed-expense.entity';
import { OneOffIncome } from './entities/one-off-income.entity';
import { RecurringIncome } from './entities/recurring-income.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringIncome, OneOffIncome, FixedExpense]),
  ],
})
export class IncomesModule {}
