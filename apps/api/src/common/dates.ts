import { BadRequestException } from '@nestjs/common';
import type { IsoDate } from '@greenlight/engine';

/**
 * La fecha de un día como YYYY-MM-DD en la zona horaria local. No usa toISOString(): eso es UTC y,
 * en Colombia (UTC-5), después de las 7 p. m. ya devolvería el día siguiente.
 */
export function isoDateOf(date: Date = new Date()): IsoDate {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** La fecha `days` días antes (o después, si es negativo) de otra YYYY-MM-DD, en calendario local. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return isoDateOf(new Date(year, month - 1, day + days));
}

/** El día anterior a una fecha YYYY-MM-DD (en calendario local, sin pasar por UTC). */
export function dayBefore(date: IsoDate): IsoDate {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return isoDateOf(new Date(year, month - 1, day - 1));
}

/** La vigencia no puede terminar antes de empezar (YYYY-MM-DD se compara como texto). */
export function assertDateRange(startDate: IsoDate, endDate: IsoDate | undefined): void {
  if (endDate !== undefined && endDate < startDate) {
    throw new BadRequestException(`La fecha de fin (${endDate}) no puede ser anterior a la de inicio (${startDate})`);
  }
}
