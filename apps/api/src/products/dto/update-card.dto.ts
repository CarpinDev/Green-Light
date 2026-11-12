import type { AmortizationMethod, FirstPeriodInterest } from '@greenlight/engine';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AMORTIZATION_METHODS, FIRST_PERIOD_INTERESTS } from '../amortization';
import type { UpdateCardInput } from '../cards.service';

/**
 * Lo editable de una tarjeta. Sin `bank` ni `last4`: son su identidad, y si cambian es otra tarjeta
 * (con forbidNonWhitelisted, mandarlos es 400).
 */
export class UpdateCardDto implements UpdateCardInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  creditLimitCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  handlingFeeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  insuranceCents?: number;

  @IsOptional()
  @IsIn(AMORTIZATION_METHODS)
  minPaymentMethod?: AmortizationMethod;

  @IsOptional()
  @IsBoolean()
  singleInstallmentInterestFree?: boolean;

  @IsOptional()
  @IsIn(FIRST_PERIOD_INTERESTS)
  firstPeriodInterest?: FirstPeriodInterest;
}
