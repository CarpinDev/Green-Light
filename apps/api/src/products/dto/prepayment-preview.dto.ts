import type { PrepaymentMode } from '@greenlight/engine';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import { PREPAYMENT_MODES } from '../../movements/prepayment-mode';

/** El cuerpo de POST /loans/:id/prepayment-preview: lo mismo que un abono, sin guardarlo. */
export class PrepaymentPreviewDto {
  @IsIsoDate()
  date!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsIn(PREPAYMENT_MODES)
  mode!: PrepaymentMode;
}
