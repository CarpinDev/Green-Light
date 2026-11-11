import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { IsIsoDate } from '../../common/validators';
import { PromoDto } from '../../movements/dto/create-expense.dto';
import type { SimulationInput } from '../simulations.service';

/** El cuerpo de POST /simulations: la compra que estás pensando hacer. */
export class SimulatePurchaseDto implements SimulationInput {
  @IsInt()
  @Min(1)
  cardId!: number;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  @IsInt()
  @Min(1)
  @Max(72)
  installments!: number;

  /** Sin fecha, hoy. */
  @IsOptional()
  @IsIsoDate()
  date?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromoDto)
  promo?: PromoDto;

  /** Meses a proyectar: de 1 a 24, 6 por defecto. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}
