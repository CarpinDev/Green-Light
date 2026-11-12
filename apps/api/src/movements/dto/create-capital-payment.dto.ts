import type { PrepaymentMode } from '@greenlight/engine';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type { CreateCapitalPaymentInput } from '../capital-payments.service';
import { PREPAYMENT_MODES } from '../prepayment-mode';

export class CreateCapitalPaymentDto implements CreateCapitalPaymentInput {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsIsoDate()
  date!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsOptional()
  @IsIn(PREPAYMENT_MODES)
  mode?: PrepaymentMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  expenseId?: number;

  /** La cuenta de la que sale el dinero. No se combina con `external`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceAccountId?: number;

  /** Dinero que no pasa por las cuentas. No se combina con `sourceAccountId`. */
  @IsOptional()
  @IsBoolean()
  external?: boolean;
}
