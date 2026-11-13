import type { Cents, IsoDate } from '@greenlight/engine';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { Account } from './account.entity';
import { User } from '../../users/entities/user.entity';

/** Saldos confirmados; el último es el punto de partida de la proyección. */
@Entity('account_balance')
@Index(['userId'])
@Unique(['productId', 'asOf'])
export class AccountBalance {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column() productId!: number;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  account!: Account;

  @Column({ type: 'date' }) asOf!: IsoDate;

  /** Puede ser negativo (sobregiro): sin CHECK >= 0. */
  @Column({ type: 'bigint', transformer: centsTransformer })
  balanceCents!: Cents;

  /**
   * Cuándo se confirmó (en la base, no en la app). Al reemplazar el saldo del mismo día se borra y se
   * vuelve a crear la fila, para que esta hora avance: lo registrado entre una y otra confirmación ya
   * está dentro del saldo nuevo.
   */
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
