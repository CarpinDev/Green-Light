import type { AmortizationMethod, Cents, IsoDate } from '@greenlight/engine';
import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { AMORTIZATION_METHODS } from '../amortization';
import { Product } from './product.entity';

/** Datos de préstamo de un producto kind = 'loan'. Comparte la llave con product. */
@Entity('loan')
@Check(`"principal_cents" > 0`)
@Check(`"term_months" >= 1`)
@Check(`"fixed_payment_cents" IS NULL OR "fixed_payment_cents" > 0`)
@Check(`"insurance_cents" >= 0`)
export class Loan {
  @PrimaryColumn() productId!: number;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  /** O el saldo actual si el préstamo ya existía. */
  @Column({ type: 'bigint', transformer: centsTransformer })
  principalCents!: Cents;

  /** O las cuotas que faltan. */
  @Column({ type: 'smallint' }) termMonths!: number;

  @Column({ type: 'date' }) firstPaymentDate!: IsoDate;

  /** Cuota informada por el banco (capital + interés); si falta, se calcula. */
  @Column({ type: 'bigint', transformer: centsTransformer, nullable: true })
  fixedPaymentCents!: Cents | null;

  @Column({ type: 'bigint', transformer: centsTransformer, default: 0 })
  insuranceCents!: Cents;

  @Column({
    type: 'enum',
    enum: AMORTIZATION_METHODS,
    enumName: 'amortization_method',
    default: 'fixed_installment',
  })
  method!: AmortizationMethod;
}
