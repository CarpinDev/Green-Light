import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { PromoDto } from '../../movements/dto/create-expense.dto';
import type { OpeningDebtInput, OpeningDebtItemInput } from '../opening-debt.service';

/** Un grupo de la deuda inicial: capital pendiente de compras con las mismas cuotas restantes. */
export class OpeningDebtItemDto implements OpeningDebtItemInput {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountCents!: number;

  /** Cuotas que le faltan al grupo. */
  @IsInt()
  @Min(1)
  @Max(72)
  installments!: number;

  /** Si el grupo tiene una tasa propia (p. ej. 0 % de una promoción). Sin ella, la de la tarjeta. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PromoDto)
  promo?: PromoDto;
}

/** El cuerpo de POST /cards/:id/opening-debt: de 1 a 30 grupos. */
export class OpeningDebtDto implements OpeningDebtInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OpeningDebtItemDto)
  items!: OpeningDebtItemDto[];
}
