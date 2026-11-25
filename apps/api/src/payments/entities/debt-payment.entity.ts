import type { Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Account } from '../../products/entities/account.entity';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Un pago de tarjeta o préstamo que la persona confirmó: lo que de verdad pasó en vez de lo que la proyección
 * suponía. Se identifica por `scheduledDate` (el corte de la tarjeta o la fecha de la cuota), que no cambia
 * aunque se pague otro día. `amountCents` es TODO lo pagado: lo que pase del mínimo vive aparte, como un
 * `capital_payment` ligado a este pago (se borra con él).
 */
@Entity('debt_payment')
@Index(['userId'])
@Index(['productId', 'scheduledDate'], { unique: true })
@Check(`"amount_cents" > 0`)
// De una cuenta o de afuera, no las dos (igual que en capital_payment)
@Check(`NOT ("is_external" AND "source_account_id" IS NOT NULL)`)
export class DebtPayment {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Tarjeta o préstamo. */
  @Column() productId!: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  /** Qué pago esperado es: el corte (tarjeta) o la fecha de la cuota (préstamo). */
  @Column({ type: 'date' }) scheduledDate!: IsoDate;

  /** El día en que se pagó de verdad. */
  @Column({ type: 'date' }) paidDate!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  @Column({ type: 'int', nullable: true }) sourceAccountId!: number | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_account_id' })
  sourceAccount!: Account | null;

  /** Plata que no pasa por las cuentas: baja la deuda pero no el disponible. */
  @Column({ default: false }) isExternal!: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
