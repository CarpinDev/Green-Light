import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Account } from '../../products/entities/account.entity';
import { User } from '../../users/entities/user.entity';

/** Salario u otros ingresos que llegan cada mes. */
@Entity('recurring_income')
@Index(['userId'])
@Check(`"amount_cents" > 0`)
@Check(`"day_of_month" BETWEEN 1 AND 31`)
@Check(`"end_date" IS NULL OR "end_date" >= "start_date"`)
export class RecurringIncome {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column() name!: string;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  /** 1..31; si el mes es más corto se usa el último día. */
  @Column({ type: 'smallint' }) dayOfMonth!: number;

  @Column({ type: 'date' }) startDate!: IsoDate;

  @Column({ type: 'date', nullable: true }) endDate!: IsoDate | null;

  @Column({ type: 'int', nullable: true }) destinationAccountId!: number | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'destination_account_id' })
  destinationAccount!: Account | null;

  /** El registro que lo reemplazó por un cambio de monto. Con valor, no se reactiva (se edita el vigente). */
  @Column({ type: 'int', nullable: true }) replacedById!: number | null;

  // SET NULL: si se borra el sucesor, este vuelve a poder reactivarse
  @ManyToOne(() => RecurringIncome, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy!: RecurringIncome | null;
}
