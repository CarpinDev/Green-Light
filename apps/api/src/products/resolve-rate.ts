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
    return { ea, mv, source: 'both' };
  }
  if (ea !== undefined) return { ea, mv: fromEngine(() => eaToMv(ea)), source: 'ea' };
  if (mv !== undefined) return { ea: fromEngine(() => mvToEa(mv)), mv, source: 'mv' };

  throw new BadRequestException('Falta la tasa: envía la E.A., la M.V. o las dos');
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
  return value;
}

function fromEngine(calculate: () => Decimal): Decimal {
  try {
    return calculate();
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : 'Tasa inválida');
  }
}
