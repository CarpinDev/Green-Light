import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Category } from '../../movements/entities/category.entity';
import { CreditCard } from '../../products/entities/credit-card.entity';

/** Arriendo, servicios, suscripciones: un cargo cada mes. */
@Entity('fixed_expense')
@Check(`"amount_cents" > 0`)
@Check(`"day_of_month" BETWEEN 1 AND 31`)
@Check(`"end_date" IS NULL OR "end_date" >= "start_date"`)
export class FixedExpense {
  @PrimaryGeneratedColumn() id!: number;

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
}
