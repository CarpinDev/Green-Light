import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Settings } from '../settings/entities/settings.entity';
import { type ProjectionResult, buildProjection } from './build-projection';

const SETTINGS_ID = 1;

/** Carga las filas y llama a buildProjection: aquí no hay ninguna regla de negocio. */
@Injectable()
export class ProjectionService {
  constructor(private readonly dataSource: DataSource) {}

  async project(months: number): Promise<ProjectionResult> {
    const db = this.dataSource;
    const [balances, cards, loans, rates, expenses, capitalPayments, recurringIncomes, oneOffIncomes, fixedExpenses, settings] =
      await Promise.all([
        db.getRepository(AccountBalance).find(),
        db.getRepository(CreditCard).find(),
        db.getRepository(Loan).find(),
        db.getRepository(ProductRate).find(),
        db.getRepository(Expense).find(),
        db.getRepository(CapitalPayment).find(),
        db.getRepository(RecurringIncome).find(),
        db.getRepository(OneOffIncome).find(),
        db.getRepository(FixedExpense).find(),
        db.getRepository(Settings).findOneByOrFail({ id: SETTINGS_ID }),
      ]);

    return buildProjection(
      { balances, cards, loans, rates, expenses, capitalPayments, recurringIncomes, oneOffIncomes, fixedExpenses, settings },
      months,
    );
  }
}
