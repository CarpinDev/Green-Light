import type { PrepaymentMode } from '@greenlight/engine';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import { PREPAYMENT_MODES } from '../../movements/prepayment-mode';
import type { CreateDebtPaymentInput } from '../debt-payments.service';

export class CreateDebtPaymentDto implements CreateDebtPaymentInput {
  @IsInt()
  @Min(1)
  productId!: number;

  /** El corte de la tarjeta o la fecha de la cuota. */
  @IsIsoDate()
  scheduledDate!: string;

  @IsIsoDate()
  paidDate!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sourceAccountId?: number;

  @IsOptional()
  @IsBoolean()
  external?: boolean;

  @IsOptional()
  @IsIn(PREPAYMENT_MODES)
  mode?: PrepaymentMode;
}
