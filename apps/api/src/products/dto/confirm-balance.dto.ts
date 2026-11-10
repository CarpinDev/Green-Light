import { IsInt, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type { ConfirmBalanceInput } from '../accounts.service';

export class ConfirmBalanceDto implements ConfirmBalanceInput {
  @IsIsoDate()
  asOf!: string;

  /** Puede ser negativo (sobregiro): sin @Min(0). */
  @IsInt()
  @Min(Number.MIN_SAFE_INTEGER)
  @Max(Number.MAX_SAFE_INTEGER)
  balanceCents!: number;
}
