import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import type { CreateRecurringConfirmationInput } from '../recurring-confirmations.service';

export class CreateRecurringConfirmationDto implements CreateRecurringConfirmationInput {
  /** El ingreso recurrente (salario). Uno de los dos: este o `fixedExpenseId`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  recurringIncomeId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  fixedExpenseId?: number;

  /** La fecha esperada de esa ocurrencia. */
  @IsIsoDate()
  scheduledDate!: string;

  @IsIsoDate()
  actualDate!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  /** La cuenta donde llegó o de donde salió. */
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;
}
