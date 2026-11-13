import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Category } from '../../movements/entities/category.entity';
import { Account } from '../../products/entities/account.entity';
import { CreditCard } from '../../products/entities/credit-card.entity';
import { User } from '../../users/entities/user.entity';

/** Arriendo, servicios, suscripciones: un cargo cada mes. */
@Entity('fixed_expense')
@Index(['userId'])
@Check(`"amount_cents" > 0`)
@Check(`"day_of_month" BETWEEN 1 AND 31`)
@Check(`"end_date" IS NULL OR "end_date" >= "start_date"`)
@Check(`"card_id" IS NULL OR "account_id" IS NULL`)
export class FixedExpense {
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

  @Column({ type: 'int', nullable: true }) categoryId!: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category!: Category | null;

  @Column({ type: 'date' }) startDate!: IsoDate;

  @Column({ type: 'date', nullable: true }) endDate!: IsoDate | null;

  /** Si se paga con tarjeta: compra a 1 cuota cada mes. */
  @Column({ type: 'int', nullable: true }) cardId!: number | null;

  // RESTRICT y no SET NULL: con SET NULL el gasto pasaría sin avisar a salir del disponible
  @ManyToOne(() => CreditCard, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'card_id' })
  card!: CreditCard | null;

  /** Si sale de una cuenta. Es información de origen: la proyección usa un solo disponible y no cambia. */
  @Column({ type: 'int', nullable: true }) accountId!: number | null;

  // RESTRICT, igual que la tarjeta; y como mucho una de las dos (el CHECK de arriba)
  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: Account | null;

  /** El registro que lo reemplazó por un cambio de monto. Con valor, no se reactiva (se edita el vigente). */
  @Column({ type: 'int', nullable: true }) replacedById!: number | null;

  // SET NULL: si se borra el sucesor, este vuelve a poder reactivarse
  @ManyToOne(() => FixedExpense, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy!: FixedExpense | null;
}
