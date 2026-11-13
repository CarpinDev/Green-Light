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

/** Carga las filas y llama a buildProjection: aquí no hay ninguna regla de negocio. */
@Injectable()
export class ProjectionService {
  constructor(private readonly dataSource: DataSource) {}

  async project(userId: number, months: number): Promise<ProjectionResult> {
    return buildProjection(await this.loadFacts(userId), months, isoDateOf());
  }

  /** Todas las filas DEL USUARIO que necesita la proyección; también las usa el simulador. */
  async loadFacts(userId: number): Promise<ProjectionFacts> {
    const db = this.dataSource;
    const mine = { where: { userId } };
    const [
      balances,
      allCards,
      allLoans,
      rates,
      expenses,
      capitalPayments,
      recurringIncomes,
      oneOffIncomes,
      fixedExpenses,
      settings,
      products,
    ] = await Promise.all([
      db.getRepository(AccountBalance).find(mine),
      db.getRepository(CreditCard).find(),
      db.getRepository(Loan).find(),
      db.getRepository(ProductRate).find(mine),
      db.getRepository(Expense).find(mine),
      db.getRepository(CapitalPayment).find(mine),
      db.getRepository(RecurringIncome).find(mine),
      db.getRepository(OneOffIncome).find(mine),
      db.getRepository(FixedExpense).find(mine),
      db.getRepository(Settings).findOneByOrFail({ userId }),
      db.getRepository(Product).find(mine),
    ]);

    // credit_card y loan no tienen user_id (comparten la llave con product): sin este filtro, las tarjetas y los
    // préstamos de TODAS las personas entrarían a la proyección de cada una. El dueño sale del producto.
    const owned = new Set(products.map((p) => p.id));
    const cards = allCards.filter((c) => owned.has(c.productId));
    const loans = allLoans.filter((l) => owned.has(l.productId));
    const archived = products.filter((p) => !p.active);

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
