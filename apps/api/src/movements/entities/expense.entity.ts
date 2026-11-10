import type { Cents, IsoDate } from '@greenlight/engine';
import type Decimal from 'decimal.js';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Product } from '../../products/entities/product.entity';
import { Category } from './category.entity';

/**
 * Gasto diario. Con tarjeta, el motor lo ubica en el corte según la fecha.
 * Las reglas que cruzan tablas (no gastar desde un préstamo, cuotas obligatorias
 * con tarjeta) van en el service, no aquí.
 */
@Entity('expense')
@Index(['date'])
@Index(['sourceProductId', 'date'])
@Check(`"amount_cents" > 0`)
@Check(`"installments" IS NULL OR "installments" BETWEEN 1 AND 72`)
// Promoción: la E.A. y la M.V. van juntas o no va ninguna
@Check(`("promo_ea" IS NULL) = ("promo_mv" IS NULL)`)
@Check(`"promo_ea" >= 0 AND "promo_mv" >= 0`)
export class Expense {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ type: 'date' }) date!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  amountCents!: Cents;

  @Column({ type: 'int', nullable: true }) categoryId!: number | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category!: Category | null;

  @Column({ default: '' }) description!: string;

  /** Cuenta (sale del disponible) o tarjeta; nunca préstamo. */
  @Column() sourceProductId!: number;

  // No se puede borrar una tarjeta o cuenta que tiene gastos
  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_product_id' })
  sourceProduct!: Product;

  /** Obligatorio si es tarjeta (1..72); null si es cuenta. */
  @Column({ type: 'smallint', nullable: true }) installments!: number | null;

  /** Promoción de esta compra, p. ej. 0 % a 12 cuotas. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 12,
    nullable: true,
    transformer: decimalTransformer,
  })
  promoEa!: Decimal | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 12,
    nullable: true,
    transformer: decimalTransformer,
  })
  promoMv!: Decimal | null;

  @Column({ default: '' }) promoDescription!: string;

  /** Deuda previa cargada al empezar a usar la app. */
  @Column({ default: false }) isOpeningDebt!: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
