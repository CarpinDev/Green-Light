import { BadRequestException } from '@nestjs/common';
import { compareInstallments, simulatePurchase } from '@greenlight/engine';
import type * as Engine from '@greenlight/engine';
import { type RateInput, resolveRate } from '../products/resolve-rate';
import { type ProjectionFacts, prepareProjection } from './build-projection';

/** La compra que estás pensando hacer, con la forma que recibe la API (centavos, ids de producto). */
export interface SimulationCandidate {
  cardId: number;
  date: Engine.IsoDate;
  amountCents: Engine.Cents;
  installments: number;
  /** Promoción de la compra: la E.A., la M.V. o las dos, igual que en un gasto. */
  promo?: RateInput;
}

export interface SimulationOutcome extends Engine.SimulationResult {
  asOf: Engine.IsoDate;
  daysSinceBalance: number;
  /** La misma compra a 1, 3, 6 y 12 cuotas. */
  options: Engine.InstallmentOption[];
}

/** El id de la compra imaginaria dentro del motor: no existe en la base. */
const CANDIDATE_ID = 'simulacion';

/**
 * ¿Puedo comprar esto? Pura, igual que buildProjection: recibe las mismas filas más la compra
 * y devuelve tu proyección con y sin ella, lo que cuesta cada plazo y si cabe en el cupo.
 * Si falta un saldo reciente responde como la proyección (400 / 409).
 */
export function buildSimulation(
  facts: ProjectionFacts,
  candidate: SimulationCandidate,
  months: number,
  today: Engine.IsoDate,
): SimulationOutcome {
  if (!facts.cards.some((c) => c.productId === candidate.cardId)) {
    throw new BadRequestException(`El producto ${candidate.cardId} no es una tarjeta de crédito`);
  }
  const promoRate = candidate.promo === undefined ? undefined : toPromoRate(candidate.promo);

  // La proyección de base lleva todo menos los eventos de esta tarjeta: simulatePurchase los agrega
  const prepared = prepareProjection(facts, months, today, candidate.cardId);
  const asOf = prepared.input.asOf;
  if (candidate.date < asOf) {
    throw new BadRequestException(
      `La compra es del ${candidate.date}, anterior a tu último saldo (${asOf}): ese saldo ya la tendría contada`,
    );
  }

  const own = prepared.cards.find((c) => c.card.id === String(candidate.cardId));
  if (own === undefined) throw new Error(`la tarjeta ${candidate.cardId} no llegó a la proyección`);

  const purchase: Engine.CardPurchase = {
    id: CANDIDATE_ID,
    cardId: own.card.id,
    date: candidate.date,
    amount: candidate.amountCents,
    installments: candidate.installments,
    ...(promoRate && { promoRate }),
  };

  const result = simulatePurchase({
    card: own.card,
    purchases: own.purchases,
    payments: own.payments,
    fixedExpenses: prepared.fixedExpenses,
    baseline: prepared.input,
    candidate: purchase,
    months,
  });

  return {
    asOf,
    daysSinceBalance: prepared.daysSinceBalance,
    options: compareInstallments(own.card, purchase),
    ...result,
  };
}

function toPromoRate(promo: RateInput): Engine.Rate {
  const { ea, mv } = resolveRate({ ea: promo.ea, mv: promo.mv });
  return { ea, mv };
}
