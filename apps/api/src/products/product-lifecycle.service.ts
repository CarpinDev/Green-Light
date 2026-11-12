import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { payoffAmount } from '@greenlight/engine';
import { DataSource, type EntityManager } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { toEngineLoan, toLoanPrepayment } from '../projection/mappers';
import { CardPlanService } from './card-plan.service';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { CreditCard } from './entities/credit-card.entity';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { StatementCheck } from './entities/statement-check.entity';
import type { ProductKind } from './product-kind';

/** Algo que usa el producto y no se borra con él: hay que resolverlo primero. */
export interface ProductBlocker {
  kind: 'fixed_expense' | 'recurring_income' | 'one_off_income';
  id: number;
  name: string;
}

/** Lo que se borraría con el producto y lo que lo bloquea. */
export interface ProductUsage {
  expenses: number;
  capitalPayments: number;
  balances: number;
  rates: number;
  blockers: ProductBlocker[];
}

/** La palabra del producto y su género, para que los mensajes lean bien ("esta tarjeta", "este préstamo"). */
const NOUN: Record<ProductKind, { word: string; this: string; clitic: 'la' | 'lo' }> = {
  credit_card: { word: 'tarjeta', this: 'Esta', clitic: 'la' },
  account: { word: 'cuenta', this: 'Esta', clitic: 'la' },
  loan: { word: 'préstamo', this: 'Este', clitic: 'lo' },
};

const pesosText = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(cents / 100)
    .replace(/\s/g, ' ');

/**
 * Eliminar y archivar productos. Eliminar borra el producto con todo lo suyo; archivar solo lo apaga
 * (`active = false`): sale de las listas y de la proyección, pero conserva su historial.
 */
@Injectable()
export class ProductLifecycleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cardPlan: CardPlanService,
  ) {}

  /** Cuánto se borraría y qué lo bloquea, para que la app lo muestre antes de confirmar. */
  async usage(productId: number): Promise<ProductUsage> {
    return this.dataSource.transaction(async (manager) => {
      await this.requireProduct(manager, productId);
      return this.usageOf(manager, productId);
    });
  }

  /**
   * Borra el producto y todo lo que es solo suyo, en una transacción. El orden va de lo que depende a lo que
   * es dependido, porque varias llaves son RESTRICT: primero los abonos (apuntan a gastos y al producto), luego
   * los gastos, y al final el producto. Sus tasas, saldos, extractos y los datos de tarjeta/cuenta/préstamo
   * cuelgan de él con CASCADE; se borran a mano igual para no depender de eso y que el orden se lea completo.
   */
  async remove(productId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.requireProduct(manager, productId);
      const usage = await this.usageOf(manager, productId);
      if (usage.blockers.length > 0)
        throw new ConflictException(blockedMessage(product.kind, usage.blockers, 'eliminar'));

      await manager.delete(CapitalPayment, { productId });
      await manager.delete(Expense, { sourceProductId: productId });
      await manager.delete(StatementCheck, { productId });
      await manager.delete(AccountBalance, { productId });
      await manager.delete(ProductRate, { productId });
      await manager.delete(CreditCard, { productId });
      await manager.delete(Account, { productId });
      await manager.delete(Loan, { productId });
      await manager.delete(Product, { id: productId });
    });
  }

  /**
   * Archiva. Una tarjeta o un préstamo con deuda pendiente no se puede (409); una cuenta sí, aunque tenga saldo.
   * Archivar uno ya archivado no cambia nada.
   */
  async archive(productId: number, today = isoDateOf()): Promise<{ id: number; active: boolean }> {
    const product = await this.dataSource.transaction(async (manager) => {
      const found = await this.requireProduct(manager, productId);
      const usage = await this.usageOf(manager, productId);
      if (usage.blockers.length > 0)
        throw new ConflictException(blockedMessage(found.kind, usage.blockers, 'archivar'));
      return found;
    });

    const owed = await this.pendingDebt(product, today);
    if (owed > 0) {
      const { word, clitic } = NOUN[product.kind];
      const that = clitic === 'la' ? 'esta' : 'este';
      const advice =
        clitic === 'la'
          ? 'Archívala cuando la termines de pagar, o elimínala si fue un error.'
          : 'Archívalo cuando lo termines de pagar, o elimínalo si fue un error.';
      throw new ConflictException(`Todavía debes ${pesosText(owed)} en ${that} ${word}. ${advice}`);
    }

    await this.dataSource.getRepository(Product).save({ ...product, active: false });
    return { id: productId, active: false };
  }

  async unarchive(productId: number): Promise<{ id: number; active: boolean }> {
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: productId });
    if (!product) throw new NotFoundException(`El producto ${productId} no existe`);
    await this.dataSource.getRepository(Product).save({ ...product, active: true });
    return { id: productId, active: true };
  }

  /** Lo que todavía se debe: el capital por facturar de la tarjeta, o el saldo del préstamo. 0 en una cuenta. */
  private async pendingDebt(product: Product, today: string): Promise<number> {
    if (product.kind === 'credit_card') {
      // El primer corte del plan es el extracto sin vencer: su capital más todo el que falta por facturar
      const [first] = (await this.cardPlan.plan(product.id, 1, today)).cuts;
      return first === undefined ? 0 : first.minimum.capital + first.remainingDebtCents;
    }
    if (product.kind === 'loan') {
      const db = this.dataSource;
      const loan = await db.getRepository(Loan).findOneBy({ productId: product.id });
      if (!loan) return 0;
      const [rates, payments] = await Promise.all([
        db.getRepository(ProductRate).find({ where: { productId: product.id } }),
        db.getRepository(CapitalPayment).find({ where: { productId: product.id } }),
      ]);
      return payoffAmount(toEngineLoan(loan, rates), today, payments.map(toLoanPrepayment));
    }
    return 0;
  }

  private async requireProduct(manager: EntityManager, id: number): Promise<Product> {
    const product = await manager.findOneBy(Product, { id });
    if (!product) throw new NotFoundException(`El producto ${id} no existe`);
    return product;
  }

  private async usageOf(manager: EntityManager, productId: number): Promise<ProductUsage> {
    const [expenses, capitalPayments, balances, rates, fixed, recurring, oneOff] = await Promise.all([
      manager.find(Expense, { where: { sourceProductId: productId } }),
      manager.find(CapitalPayment, { where: { productId } }),
      manager.find(AccountBalance, { where: { productId } }),
      manager.find(ProductRate, { where: { productId } }),
      manager.find(FixedExpense, { where: { cardId: productId } }),
      manager.find(RecurringIncome, { where: { destinationAccountId: productId } }),
      manager.find(OneOffIncome, { where: { destinationAccountId: productId } }),
    ]);
    return {
      expenses: expenses.length,
      capitalPayments: capitalPayments.length,
      balances: balances.length,
      rates: rates.length,
      blockers: [
        ...fixed.map((r) => ({ kind: 'fixed_expense' as const, id: r.id, name: r.name })),
        ...recurring.map((r) => ({ kind: 'recurring_income' as const, id: r.id, name: r.name })),
        ...oneOff.map((r) => ({
          kind: 'one_off_income' as const,
          id: r.id,
          name: r.description || 'Ingreso sin nombre',
        })),
      ],
    };
  }
}

/** "Esta tarjeta paga 2 gastos fijos (Arriendo, Netflix). Cámbialos o elimínalos antes de eliminarla." */
function blockedMessage(
  kind: ProductKind,
  blockers: readonly ProductBlocker[],
  action: 'eliminar' | 'archivar',
): string {
  const { word, this: This, clitic } = NOUN[kind];
  const names = (items: readonly ProductBlocker[]) => items.map((b) => b.name).join(', ');
  const fixed = blockers.filter((b) => b.kind === 'fixed_expense');
  const incomes = blockers.filter((b) => b.kind !== 'fixed_expense');

  const parts: string[] = [];
  if (fixed.length > 0) {
    parts.push(
      `${This} ${word} paga ${fixed.length} ${fixed.length === 1 ? 'gasto fijo' : 'gastos fijos'} (${names(fixed)}).`,
    );
  }
  if (incomes.length > 0) {
    parts.push(
      `A ${This.toLowerCase()} ${word} llegan ${incomes.length} ${incomes.length === 1 ? 'ingreso' : 'ingresos'} (${names(incomes)}).`,
    );
  }
  const many = blockers.length > 1;
  return `${parts.join(' ')} ${many ? 'Cámbialos o elimínalos' : 'Cámbialo o elimínalo'} antes de ${action}${clitic}.`;
}
