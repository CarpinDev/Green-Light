import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import type { UpdateExpenseInput } from '../expenses.service';
import { PromoDto } from './create-expense.dto';

/** Lo único que se corrige de un gasto: sus cuotas y su promoción (`promo: null` la quita). */
export class UpdateExpenseDto implements UpdateExpenseInput {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  installments?: number;

  // IsOptional deja pasar null (quitar la promoción); un objeto se valida como PromoDto
  @IsOptional()
  @ValidateNested()
  @Type(() => PromoDto)
  promo?: PromoDto | null;
}
