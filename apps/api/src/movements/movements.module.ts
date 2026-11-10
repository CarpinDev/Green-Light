import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Category } from './entities/category.entity';
import { Expense } from './entities/expense.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Expense, CapitalPayment])],
})
export class MovementsModule {}
