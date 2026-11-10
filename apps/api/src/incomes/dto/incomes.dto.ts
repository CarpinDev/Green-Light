import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type {
  CreateFixedExpenseInput,
  CreateOneOffIncomeInput,
  CreateRecurringIncomeInput,
} from '../incomes.service';

export class CreateRecurringIncomeDto implements CreateRecurringIncomeInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsIsoDate()
  startDate!: string;

  /** Debe ser igual o posterior a startDate (lo revisa el service). */
  @IsOptional()
  @IsIsoDate()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  destinationAccountId?: number;
}

export class CreateOneOffIncomeDto implements CreateOneOffIncomeInput {
  @IsIsoDate()
  date!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  destinationAccountId?: number;
}

export class CreateFixedExpenseDto implements CreateFixedExpenseInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsIsoDate()
  startDate!: string;

  /** Debe ser igual o posterior a startDate (lo revisa el service). */
  @IsOptional()
  @IsIsoDate()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cardId?: number;
}
