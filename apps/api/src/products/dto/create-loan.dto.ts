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

  /** La cuota completa del extracto (con el seguro fijo): la API le resta el seguro. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  installmentTotalCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  insuranceCents?: number;

  /** Seguro como porcentaje mensual del saldo, como texto: "0.2344". */
  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,4})?$/, { message: 'insuranceRatePct debe ser un porcentaje como 0.2344' })
  insuranceRatePct?: string;

  @IsOptional()
  @IsIn(AMORTIZATION_METHODS)
  method?: AmortizationMethod;
}
