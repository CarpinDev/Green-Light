import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { Settings } from './entities/settings.entity';

/** Los cuatro umbrales, como texto: '0.30' es 30 %. */
export const THRESHOLDS = [
  'yellowBelowIncomePct',
  'cardUtilizationPct',
  'debtToIncomePct',
  'statementTolerancePct',
] as const;
export type Threshold = (typeof THRESHOLDS)[number];

export type SettingsView = Record<Threshold, string>;
export type UpdateSettingsInput = Partial<Record<Threshold, string>>;

/** Una fila por usuario: se crea junto con la cuenta (ver UsersService.create). */
@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  async get(userId: number): Promise<SettingsView> {
    return toView(await this.load(userId));
  }

  /** Cambia solo los umbrales que lleguen. Cada uno debe estar entre 0 y 1. */
  async update(userId: number, input: UpdateSettingsInput): Promise<SettingsView> {
    const changes: Partial<Record<Threshold, Decimal>> = {};
    for (const key of THRESHOLDS) {
      const raw = input[key];
      if (raw !== undefined) changes[key] = parseThreshold(key, raw);
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(`Envía al menos un umbral: ${THRESHOLDS.join(', ')}`);
    }

    // Se carga primero: si falta la fila es un error del sistema, no del usuario
    await this.load(userId);
    await this.dataSource.getRepository(Settings).save({ userId, ...changes });
    // save() con un objeto parcial devuelve solo lo que se le pasó: se recarga la fila completa
    return toView(await this.load(userId));
  }

  private async load(userId: number): Promise<Settings> {
    const row = await this.dataSource.getRepository(Settings).findOneBy({ userId });
    if (!row) throw new InternalServerErrorException('Falta la fila de ajustes: ¿se corrieron las migraciones?');
    return row;
  }
}

function parseThreshold(key: Threshold, raw: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    throw new BadRequestException(`${key} "${raw}" no es un número`);
  }
  if (!value.isFinite() || value.lt(0) || value.gt(1)) {
    throw new BadRequestException(`${key} "${raw}" está fuera de rango: debe estar entre 0 y 1`);
  }
  return value;
}

function toView(row: Settings): SettingsView {
  return {
    yellowBelowIncomePct: row.yellowBelowIncomePct.toString(),
    cardUtilizationPct: row.cardUtilizationPct.toString(),
    debtToIncomePct: row.debtToIncomePct.toString(),
    statementTolerancePct: row.statementTolerancePct.toString(),
  };
}
