import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type { CreateExpenseInput } from '../expenses.service';

/** Promoción de una compra con tarjeta: la E.A., la M.V. o las dos. */
export class PromoDto {
  /** Fracción como texto: '0' es una promoción sin interés. */
  @IsOptional()
  @IsNumberString()
  ea?: string;

  @IsOptional()
  @IsNumberString()
  mv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateExpenseDto implements CreateExpenseInput {
  @IsIsoDate()
  date!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsInt()
  @Min(1)
  sourceProductId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  installments?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromoDto)
  promo?: PromoDto;

  @IsOptional()
  @IsBoolean()
  isOpeningDebt?: boolean;
}
