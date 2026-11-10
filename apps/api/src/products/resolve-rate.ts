import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { eaToMv, mvToEa } from '@greenlight/engine';
import type { RateSource } from './rate-source';

export interface RateInput {
  /** Fracción como texto: '0.2899' es 28,99 %. */
  ea?: string;
  mv?: string;
}

export interface ResolvedRate {
  ea: Decimal;
  mv: Decimal;
  source: RateSource;
}

/**
 * El banco publica la M.V. redondeada (2,14 % para 28,99 % E.A., no 2,1440335 %),
 * así que la M.V. dada puede diferir de la calculada hasta media centésima de punto.
 */
const MV_TOLERANCE = new Decimal('0.00005');

/**
 * Decide qué se guarda en product_rate según lo que dio el usuario: la E.A., la M.V. o las dos.
 * Todo dato malo es un 400: ni el motor (que lanza Error con tasas negativas) ni decimal.js
 * (que lanza con texto que no es número) pueden convertirlo en un 500.
 */
export function resolveRate(input: RateInput): ResolvedRate {
  const ea = input.ea === undefined ? undefined : parseRate(input.ea, 'E.A.');
  const mv = input.mv === undefined ? undefined : parseRate(input.mv, 'M.V.');

  if (ea !== undefined && mv !== undefined) {
    const expected = fromEngine(() => eaToMv(ea));
    if (mv.minus(expected).abs().gt(MV_TOLERANCE)) {
      throw new BadRequestException(
        `La M.V. ${mv.toString()} no corresponde a la E.A. ${ea.toString()} (se esperaba cerca de ${expected.toString()})`,
      );
    }
    return inRange({ ea, mv, source: 'both' });
  }
  if (ea !== undefined) return inRange({ ea, mv: fromEngine(() => eaToMv(ea)), source: 'ea' });
  if (mv !== undefined) return inRange({ ea: fromEngine(() => mvToEa(mv)), mv, source: 'mv' });

  throw new BadRequestException('Falta la tasa: envía la E.A., la M.V. o las dos');
}

/**
 * Revisa lo que se calculó, no solo lo que escribió el usuario: una M.V. de 0.2 pasa parseRate
 * pero equivale a una E.A. de 790 %, que Postgres guardaría como basura (o reventaría con un 500).
 */
function inRange(rate: ResolvedRate): ResolvedRate {
  if (rate.ea.gte(1) || rate.mv.gte(1)) {
    throw new BadRequestException(
      `La tasa está fuera de rango: E.A. ${rate.ea.toString()}, M.V. ${rate.mv.toString()} (ambas deben ser menores que 1, o sea 100 %)`,
    );
  }
  return rate;
}

function parseRate(raw: string, label: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    throw new BadRequestException(`La ${label} "${raw}" no es un número`);
  }
  if (!value.isFinite() || value.isNegative()) {
    throw new BadRequestException(`La ${label} debe ser un número finito y no negativo, llegó "${raw}"`);
  }
  // numeric(14,12) no admite 100 o más; ninguna tasa legal llega al 100 % E.A.
  if (value.gte(1)) {
    throw new BadRequestException(`La ${label} "${raw}" está fuera de rango: debe ser menor que 1 (100 %)`);
  }
  return value;
}

function fromEngine(calculate: () => Decimal): Decimal {
  try {
    return calculate();
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : 'Tasa inválida');
  }
}
