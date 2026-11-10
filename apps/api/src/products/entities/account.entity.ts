import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { ACCOUNT_TYPES, type AccountType } from '../account-type';
import { Product } from './product.entity';

/** Datos de cuenta de un producto kind = 'account'. Comparte la llave con product. */
@Entity('account')
export class Account {
  @PrimaryColumn() productId!: number;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'enum', enum: ACCOUNT_TYPES, enumName: 'account_type' })
  accountType!: AccountType;
}
