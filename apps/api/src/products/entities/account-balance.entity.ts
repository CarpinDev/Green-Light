import type { Cents, IsoDate } from '@greenlight/engine';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Account } from './account.entity';

/** Saldos confirmados; el último es el punto de partida de la proyección. */
@Entity('account_balance')
@Unique(['productId', 'asOf'])
export class AccountBalance {
  @PrimaryGeneratedColumn() id!: number;

  @Column() productId!: number;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  account!: Account;

  @Column({ type: 'date' }) asOf!: IsoDate;

  /** Puede ser negativo (sobregiro): sin CHECK >= 0. */
  @Column({ type: 'bigint', transformer: centsTransformer })
  balanceCents!: Cents;
}
