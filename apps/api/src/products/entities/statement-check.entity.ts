import type { Cents, IsoDate } from '@greenlight/engine';
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
import { centsTransformer } from '../../common/transformers/cents.transformer';
import { CreditCard } from './credit-card.entity';
import { User } from '../../users/entities/user.entity';

/** El mínimo del extracto del banco contra el que calculó el motor. Un registro por corte. */
@Entity('statement_check')
@Index(['userId'])
@Unique(['productId', 'cutDate'])
@Check(`"due_date" > "cut_date"`)
@Check(`"statement_minimum_cents" >= 0 AND "calculated_minimum_cents" >= 0`)
export class StatementCheck {
  @PrimaryGeneratedColumn() id!: number;

  /** Dueño de la fila: toda consulta filtra por él. */
  @Column() userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column() productId!: number;

  // Solo las tarjetas tienen extracto; es historial de esa tarjeta
  @ManyToOne(() => CreditCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  card!: CreditCard;

  @Column({ type: 'date' }) cutDate!: IsoDate;

  @Column({ type: 'date' }) dueDate!: IsoDate;

  @Column({ type: 'bigint', transformer: centsTransformer })
  statementMinimumCents!: Cents;

  @Column({ type: 'bigint', transformer: centsTransformer, nullable: true })
  statementTotalCents!: Cents | null;

  @Column({ type: 'bigint', transformer: centsTransformer })
  calculatedMinimumCents!: Cents;

  /** false si difiere más de settings.statementTolerancePct. */
  @Column() withinTolerance!: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
