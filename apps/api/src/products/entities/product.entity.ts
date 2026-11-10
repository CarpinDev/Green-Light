import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { PRODUCT_KINDS, type ProductKind } from '../product-kind';

@Entity('product')
@Unique(['kind', 'bank', 'last4'])
@Check(`"last4" ~ '^[0-9]{4}$'`)
export class Product {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'enum', enum: PRODUCT_KINDS, enumName: 'product_kind' }) kind!: ProductKind;
  @Column() name!: string;
  @Column() bank!: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  @Column({ length: 4 }) last4!: string;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
