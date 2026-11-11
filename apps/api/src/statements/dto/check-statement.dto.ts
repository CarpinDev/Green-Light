import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type { StatementCheckRequest } from '../statement-checks.service';

/** El cuerpo de POST /statement-checks: lo que dice el extracto que te llegó. */
export class CheckStatementDto implements StatementCheckRequest {
  @IsInt()
  @Min(1)
  cardId!: number;

  /** El día de corte del extracto. */
  @IsIsoDate()
  cutDate!: string;

  /** El pago mínimo que cobra el banco, en centavos. */
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  statementMinimumCents!: number;

  /** El pago total del extracto, si quieres guardarlo. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  statementTotalCents?: number;
}
