import type { AmortizationMethod, Cents, FirstPeriodInterest } from '@greenlight/engine';
import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { AMORTIZATION_METHODS, FIRST_PERIOD_INTERESTS } from '../amortization';
import { Product } from './product.entity';

/** Datos de tarjeta de un producto kind = 'credit_card'. Comparte la llave con product. */
@Entity('credit_card')
@Check(`"credit_limit_cents" > 0`)
@Check(`"cut_day" BETWEEN 1 AND 31`)
@Check(`"due_day" BETWEEN 1 AND 31`)
@Check(`"handling_fee_cents" >= 0 AND "insurance_cents" >= 0`)
export class CreditCard {
  @PrimaryColumn() productId!: number;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'bigint', transformer: centsTransformer }) creditLimitCents!: Cents;

  /** 1..31; si el mes es más corto se usa el último día. */
  @Column({ type: 'smallint' }) cutDay!: number;
  @Column({ type: 'smallint' }) dueDay!: number;

  /** Cuota de manejo mensual. */
  @Column({ type: 'bigint', transformer: centsTransformer, default: 0 }) handlingFeeCents!: Cents;
  @Column({ type: 'bigint', transformer: centsTransformer, default: 0 }) insuranceCents!: Cents;

  @Column({ type: 'enum', enum: AMORTIZATION_METHODS, enumName: 'amortization_method', default: 'constant_capital' })
  minPaymentMethod!: AmortizationMethod;

  /** Compras a 1 cuota sin interés. */
  @Column({ default: true }) singleInstallmentInterestFree!: boolean;

  @Column({ type: 'enum', enum: FIRST_PERIOD_INTERESTS, enumName: 'first_period_interest', default: 'prorated' })
  firstPeriodInterest!: FirstPeriodInterest;
}
