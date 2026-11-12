import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapitalPaymentsController } from './capital-payments.controller';
import { CapitalPaymentsService } from './capital-payments.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Category } from './entities/category.entity';
import { Expense } from './entities/expense.entity';
import { MovementsFeedController } from './movements-feed.controller';
import { MovementsFeedService } from './movements-feed.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Expense, CapitalPayment])],
  controllers: [ExpensesController, CategoriesController, CapitalPaymentsController, MovementsFeedController],
  providers: [ExpensesService, CategoriesService, CapitalPaymentsService, MovementsFeedService],
  exports: [ExpensesService, CategoriesService, CapitalPaymentsService],
})
export class MovementsModule {}
