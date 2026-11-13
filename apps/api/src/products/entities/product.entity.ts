import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PRODUCT_KINDS, type ProductKind } from '../product-kind';
import { User } from '../../users/entities/user.entity';

@Entity('product')
@Index(['userId'])
// Único por persona: dos usuarias pueden tener la misma tarjeta (banco y últimos 4) sin enterarse una de la otra
@Unique(['userId', 'kind', 'bank', 'last4'])
@Check(`"last4" ~ '^[0-9]{4}$'`)
export class Product {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ type: 'enum', enum: PRODUCT_KINDS, enumName: 'product_kind' }) kind!: ProductKind;
  @Column() name!: string;
  @Column() bank!: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  @Column({ length: 4 }) last4!: string;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
