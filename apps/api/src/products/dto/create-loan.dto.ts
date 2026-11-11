import type { AmortizationMethod } from '@greenlight/engine';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import { AMORTIZATION_METHODS } from '../amortization';
import type { CreateLoanInput } from '../loans.service';
import { RateDto } from './rate.dto';

export class CreateLoanDto implements CreateLoanInput {
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
  principalCents!: number;

  @IsInt()
  @Min(1)
  @Max(600)
  termMonths!: number;

  @IsIsoDate()
  firstPaymentDate!: string;

  @ValidateNested()
  @Type(() => RateDto)
  rate!: RateDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  fixedPaymentCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  insuranceCents?: number;

  @IsOptional()
  @IsIn(AMORTIZATION_METHODS)
  method?: AmortizationMethod;
}
