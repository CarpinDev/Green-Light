import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Category } from '../../movements/entities/category.entity';
import { Account } from '../../products/entities/account.entity';
import { User } from '../../users/entities/user.entity';

/** Ingreso extra puntual. */
@Entity('one_off_income')
@Index(['userId', 'date'])
@Check(`"amount_cents" > 0`)
export class OneOffIncome {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'date' }) date!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  @Column({ default: '' }) description!: string;

  @Column({ type: 'int', nullable: true }) categoryId!: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category!: Category | null;

  @Column({ type: 'int', nullable: true }) destinationAccountId!: number | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'destination_account_id' })
  destinationAccount!: Account | null;

  /** Cuándo se registró: la proyección la compara con la del saldo para los ingresos del mismo día. */
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
