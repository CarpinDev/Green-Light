import type Decimal from 'decimal.js';
import type { IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { RATE_SOURCES, type RateSource } from '../rate-source';
import { Product } from './product.entity';

/** Historial de tasas: la tasa de un día es la última vigente antes de esa fecha. */
@Entity('product_rate')
@Unique(['productId', 'effectiveFrom'])
@Check(`"ea" >= 0 AND "mv" >= 0`)
export class ProductRate {
  @PrimaryGeneratedColumn() id!: number;

  @Column() productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  /** Vigente desde (YYYY-MM-DD). pg devuelve date como string. */
  @Column({ type: 'date' }) effectiveFrom!: IsoDate;

  @Column({ type: 'numeric', precision: 14, scale: 12, transformer: decimalTransformer }) ea!: Decimal;

  /** MV = (1+EA)^(1/12) − 1 */
  @Column({ type: 'numeric', precision: 14, scale: 12, transformer: decimalTransformer }) mv!: Decimal;

  @Column({ type: 'enum', enum: RATE_SOURCES, enumName: 'rate_source' }) source!: RateSource;
}
