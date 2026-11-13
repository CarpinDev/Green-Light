import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { type CardPlan, buildCardPlan } from './build-card-plan';
import { loadCardPlanFacts } from './card-plan-facts';

export const DEFAULT_CUTS = 6;
export const MAX_CUTS = 24;

/** Carga la tarjeta y sus filas y llama a buildCardPlan: aquí no hay ninguna regla de negocio. */
@Injectable()
export class CardPlanService {
  constructor(private readonly dataSource: DataSource) {}

  async plan(userId: number, cardId: number, cuts: number = DEFAULT_CUTS, today = isoDateOf()): Promise<CardPlan> {
    return buildCardPlan(await loadCardPlanFacts(this.dataSource, userId, cardId), cuts, today);
  }
}
