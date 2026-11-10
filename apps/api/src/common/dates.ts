import { BadRequestException } from '@nestjs/common';
import type { IsoDate } from '@greenlight/engine';

/** La vigencia no puede terminar antes de empezar (YYYY-MM-DD se compara como texto). */
export function assertDateRange(startDate: IsoDate, endDate: IsoDate | undefined): void {
  if (endDate !== undefined && endDate < startDate) {
    throw new BadRequestException(`La fecha de fin (${endDate}) no puede ser anterior a la de inicio (${startDate})`);
  }
}
