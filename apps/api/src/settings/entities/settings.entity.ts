import type Decimal from 'decimal.js';
import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { User } from '../../users/entities/user.entity';

// El default va como expresión SQL (sin comillas): Postgres lo guarda como número y,
// con comillas, TypeORM lo vería distinto en cada migration:generate
const pct = (defaultValue: string) =>
  ({
    type: 'numeric',
    precision: 5,
    scale: 4,
    transformer: decimalTransformer,
    default: () => defaultValue,
  }) as const;

/**
 * Una fila por usuario: la llave es el propio user_id (1 a 1 con app_user, como credit_card con product).
 * Los nombres y defaults son los de DEFAULT_SETTINGS del motor. La fila se crea junto con el usuario.
 */
@Entity('settings')
@Check(
  `"yellow_below_income_pct" BETWEEN 0 AND 1 AND "card_utilization_pct" BETWEEN 0 AND 1 AND "debt_to_income_pct" BETWEEN 0 AND 1 AND "statement_tolerance_pct" BETWEEN 0 AND 1`,
)
export class Settings {
  @PrimaryColumn() userId!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** Semáforo amarillo si el mes cierra con menos de esta fracción del ingreso. */
  @Column(pct('0.10')) yellowBelowIncomePct!: Decimal;

  @Column(pct('0.30')) cardUtilizationPct!: Decimal;

  @Column(pct('0.30')) debtToIncomePct!: Decimal;

  /** Diferencia aceptable entre el mínimo calculado y el del banco. */
  @Column(pct('0.02')) statementTolerancePct!: Decimal;
}
