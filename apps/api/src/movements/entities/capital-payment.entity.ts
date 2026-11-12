import type { Cents, IsoDate, PrepaymentMode } from '@greenlight/engine';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Account } from '../../products/entities/account.entity';
import { Product } from '../../products/entities/product.entity';
import { PREPAYMENT_MODES } from '../prepayment-mode';
import { Expense } from './expense.entity';

/** Abono extraordinario a capital de una tarjeta o un préstamo. */
@Entity('capital_payment')
// La proyección pregunta seguido por los abonos de una tarjeta o préstamo
@Index(['productId', 'date'])
@Check(`"amount_cents" > 0`)
// De una cuenta o de afuera, no las dos
@Check(`NOT ("is_external" AND "source_account_id" IS NOT NULL)`)
export class CapitalPayment {
  @PrimaryGeneratedColumn() id!: number;

  /** Tarjeta o préstamo. */
  @Column() productId!: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'date' }) date!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  @Column({
    type: 'enum',
    enum: PREPAYMENT_MODES,
    enumName: 'prepayment_mode',
    default: 'reduce_term',
  })
  mode!: PrepaymentMode;

  /** Compra a la que se abona; null = el motor reparte por mayor tasa. */
  @Column({ type: 'int', nullable: true }) expenseId!: number | null;

  @ManyToOne(() => Expense, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expense_id' })
  expense!: Expense | null;

  /** La cuenta de la que salió el dinero; null si es externo o si es un abono de antes de que se registrara. */
  @Column({ type: 'int', nullable: true }) sourceAccountId!: number | null;

  // RESTRICT, igual que el resto: con SET NULL el abono cambiaría de origen sin avisar
  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_account_id' })
  sourceAccount!: Account | null;

  /** Dinero que no pasa por las cuentas (va directo al banco): baja la deuda pero no el disponible. */
  @Column({ default: false }) isExternal!: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
