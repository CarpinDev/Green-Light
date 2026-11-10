import type { AmortizationMethod, FirstPeriodInterest } from '@greenlight/engine';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AMORTIZATION_METHODS, FIRST_PERIOD_INTERESTS } from '../amortization';
import type { CreateCardInput } from '../cards.service';

export class RateDto {
  /** YYYY-MM-DD; el formato y que sea una fecha real. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  effectiveFrom!: string;

  /** Fracción como texto: '0.2899' es 28,99 %. */
  @IsOptional()
  @IsNumberString()
  ea?: string;

  @IsOptional()
  @IsNumberString()
  mv?: string;
}

export class CreateCardDto implements CreateCardInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  bank!: string;

  @Matches(/^\d{4}$/)
  last4!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  creditLimitCents!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  cutDay!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @ValidateNested()
  @Type(() => RateDto)
  rate!: RateDto;

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
