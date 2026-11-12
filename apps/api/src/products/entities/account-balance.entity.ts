import type { Cents, IsoDate } from '@greenlight/engine';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
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

  /**
   * Cuándo se confirmó (en la base, no en la app). Al reemplazar el saldo del mismo día se borra y se
   * vuelve a crear la fila, para que esta hora avance: lo registrado entre una y otra confirmación ya
   * está dentro del saldo nuevo.
   */
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
