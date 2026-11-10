import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/** Fecha YYYY-MM-DD: el formato exacto y que sea una fecha real (no 2026-13-45). */
export const IsIsoDate = () =>
  applyDecorators(Matches(/^\d{4}-\d{2}-\d{2}$/), IsISO8601({ strict: true }));
