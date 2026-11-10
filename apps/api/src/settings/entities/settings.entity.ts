import type Decimal from 'decimal.js';
import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';

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
 * Una sola fila. Los nombres y defaults son los de DEFAULT_SETTINGS del motor.
 * La fila se inserta en la migración; el CHECK impide que exista una segunda.
 */
@Entity('settings')
@Check(`"id" = 1`)
@Check(
  `"yellow_below_income_pct" BETWEEN 0 AND 1 AND "card_utilization_pct" BETWEEN 0 AND 1 AND "debt_to_income_pct" BETWEEN 0 AND 1 AND "statement_tolerance_pct" BETWEEN 0 AND 1`,
)
export class Settings {
  @PrimaryColumn({ type: 'smallint', default: 1 }) id!: number;

  /** Semáforo amarillo si el mes cierra con menos de esta fracción del ingreso. */
  @Column(pct('0.10')) yellowBelowIncomePct!: Decimal;

  @Column(pct('0.30')) cardUtilizationPct!: Decimal;

  @Column(pct('0.30')) debtToIncomePct!: Decimal;

  /** Diferencia aceptable entre el mínimo calculado y el del banco. */
  @Column(pct('0.02')) statementTolerancePct!: Decimal;
}
