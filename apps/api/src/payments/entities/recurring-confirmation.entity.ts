import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { FixedExpense } from '../../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../../incomes/entities/recurring-income.entity';
import { Account } from '../../products/entities/account.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Una llegada de salario (o pago de un gasto fijo) que la persona confirmó, con su fecha y monto reales. Reemplaza a
 * la ocurrencia supuesta de esa `scheduledDate`. De un ingreso o de un gasto fijo, no de los dos.
 */
@Entity('recurring_confirmation')
@Index(['userId'])
@Index(['recurringIncomeId', 'scheduledDate'], { unique: true, where: '"recurring_income_id" IS NOT NULL' })
@Index(['fixedExpenseId', 'scheduledDate'], { unique: true, where: '"fixed_expense_id" IS NOT NULL' })
@Check(`num_nonnulls("recurring_income_id", "fixed_expense_id") = 1`)
@Check(`"amount_cents" > 0`)
export class RecurringConfirmation {
  @PrimaryGeneratedColumn() id!: number;

  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'int', nullable: true }) recurringIncomeId!: number | null;

  @ManyToOne(() => RecurringIncome, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recurring_income_id' })
  recurringIncome!: RecurringIncome | null;

  @Column({ type: 'int', nullable: true }) fixedExpenseId!: number | null;

  @ManyToOne(() => FixedExpense, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixed_expense_id' })
  fixedExpense!: FixedExpense | null;

  /** La fecha esperada de esa ocurrencia (la clave: no cambia aunque llegue otro día). */
  @Column({ type: 'date' }) scheduledDate!: IsoDate;

  @Column({ type: 'date' }) actualDate!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  /** La cuenta donde llegó (ingreso) o de donde salió (gasto). Por ahora solo se guarda. */
  @Column({ type: 'int', nullable: true }) accountId!: number | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: Account | null;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
