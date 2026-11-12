import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type {
  AmountChangeInput,
  CreateFixedExpenseInput,
  CreateOneOffIncomeInput,
  CreateRecurringIncomeInput,
  UpdateFixedExpenseInput,
  UpdateRecurringIncomeInput,
  MonthlyStatus,
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

  /** La cuenta de la que sale; no se combina con cardId. */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;
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

  /** Una fecha no anterior al inicio (lo revisa el service). null no vale: un terminado no se reactiva. */
  @ValidateIf((o: { endDate?: unknown }) => o.endDate !== undefined)
  @IsIsoDate()
  endDate?: string;

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

  @ValidateIf((o: { endDate?: unknown }) => o.endDate !== undefined)
  @IsIsoDate()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  cardId?: number | null;

  /** null la quita. El resultado final no puede tener tarjeta y cuenta a la vez. */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number | null;
}

export class AmountChangeDto implements AmountChangeInput {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsIsoDate()
  effectiveFrom!: string;
}

/** GET ...?status=active|upcoming|ended. */
export class ListMonthlyQuery {
  @IsOptional()
  @IsIn(['upcoming', 'active', 'ended'])
  status?: MonthlyStatus;
}
