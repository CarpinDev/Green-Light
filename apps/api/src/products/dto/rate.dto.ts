import { IsNumberString, IsOptional } from 'class-validator';
import { IsIsoDate } from '../../common/validators';

/** Primera tasa de un producto: la E.A., la M.V. o las dos. */
export class RateDto {
  @IsIsoDate()
  effectiveFrom!: string;

  /** Fracción como texto: '0.2899' es 28,99 %. */
  @IsOptional()
  @IsNumberString()
  ea?: string;

  @IsOptional()
  @IsNumberString()
  mv?: string;
}
