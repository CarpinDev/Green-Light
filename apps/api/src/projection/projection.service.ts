import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { Settings } from '../settings/entities/settings.entity';
import { type ProjectionFacts, type ProjectionResult, buildProjection } from './build-projection';
import { excludeArchived } from './exclude-archived';

const SETTINGS_ID = 1;

/** Carga las filas y llama a buildProjection: aquí no hay ninguna regla de negocio. */
@Injectable()
export class ProjectionService {
  constructor(private readonly dataSource: DataSource) {}

  async project(months: number): Promise<ProjectionResult> {
    return buildProjection(await this.loadFacts(), months, isoDateOf());
  }

  /** Todas las filas que necesita la proyección; también las usa el simulador. */
  async loadFacts(): Promise<ProjectionFacts> {
    const db = this.dataSource;
    const [
      balances,
      cards,
      loans,
      rates,
      expenses,
      capitalPayments,
      recurringIncomes,
      oneOffIncomes,
      fixedExpenses,
      settings,
      archived,
    ] = await Promise.all([
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
      db.getRepository(Product).find({ where: { active: false } }),
    ]);
    // Un producto archivado ya no cuenta: ni su saldo, ni su deuda, ni sus gastos (el único lugar donde se filtra)
    return excludeArchived(
      {
        balances,
        cards,
        loans,
        rates,
        expenses,
        capitalPayments,
        recurringIncomes,
        oneOffIncomes,
        fixedExpenses,
        settings,
      },
      new Set(archived.map((p) => p.id)),
    );
  }
}
