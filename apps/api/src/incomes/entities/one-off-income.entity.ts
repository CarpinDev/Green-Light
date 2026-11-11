import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Category } from '../../movements/entities/category.entity';
import { Account } from '../../products/entities/account.entity';

/** Ingreso extra puntual. */
@Entity('one_off_income')
@Check(`"amount_cents" > 0`)
export class OneOffIncome {
  @PrimaryGeneratedColumn() id!: number;

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
}
