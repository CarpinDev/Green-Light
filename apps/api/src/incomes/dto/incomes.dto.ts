import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type {
  AmountChangeInput,
  CreateFixedExpenseInput,
  CreateOneOffIncomeInput,
  CreateRecurringIncomeInput,
  UpdateFixedExpenseInput,
  UpdateRecurringIncomeInput,
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

// El PATCH no acepta amountCents ni startDate: con forbidNonWhitelisted, mandarlos es 400.
// Los campos con `null` ("quitar") pasan por IsOptional, que deja pasar null y undefined.

export class UpdateRecurringIncomeDto implements UpdateRecurringIncomeInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  /** null lo reactiva; si es una fecha, no puede ser anterior al inicio (lo revisa el service). */
  @IsOptional()
  @IsIsoDate()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  destinationAccountId?: number | null;
}

export class UpdateFixedExpenseDto implements UpdateFixedExpenseInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsIsoDate()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  cardId?: number | null;
}

export class AmountChangeDto implements AmountChangeInput {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsIsoDate()
  effectiveFrom!: string;
}

/** GET ...?active=true|false. Llega como texto (la query no se transforma): se compara con 'true'. */
export class ListMonthlyQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
