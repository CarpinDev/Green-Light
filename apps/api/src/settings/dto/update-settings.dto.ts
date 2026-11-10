import { IsNumberString, IsOptional } from 'class-validator';
import type { UpdateSettingsInput } from '../settings.service';

/** Cualquiera de los 4 umbrales, como texto entre 0 y 1 (el rango lo revisa el service). */
export class UpdateSettingsDto implements UpdateSettingsInput {
  @IsOptional()
  @IsNumberString()
  yellowBelowIncomePct?: string;

  @IsOptional()
  @IsNumberString()
  cardUtilizationPct?: string;

  @IsOptional()
  @IsNumberString()
  debtToIncomePct?: string;

  @IsOptional()
  @IsNumberString()
  statementTolerancePct?: string;
}
