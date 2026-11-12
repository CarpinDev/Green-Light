import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AmortizationMethod, Cents, FirstPeriodInterest, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { definedOnly } from '../common/defined-only';
import { isUniqueViolation } from '../common/pg-errors';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { type RateInput, resolveRate } from './resolve-rate';

export interface CreateCardInput {
  name: string;
  bank: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  last4: string;
  creditLimitCents: Cents;
  cutDay: number;
  dueDay: number;
  /** Primera tasa de la tarjeta: la E.A., la M.V. o las dos. */
  rate: RateInput & { effectiveFrom: IsoDate };
  handlingFeeCents?: Cents;
  insuranceCents?: Cents;
  minPaymentMethod?: AmortizationMethod;
  singleInstallmentInterestFree?: boolean;
  firstPeriodInterest?: FirstPeriodInterest;
}

/** Lo que se puede editar: no incluye el banco ni los últimos 4 (son la identidad de la tarjeta). */
export interface UpdateCardInput {
  name?: string;
  creditLimitCents?: Cents;
  cutDay?: number;
  dueDay?: number;
  handlingFeeCents?: Cents;
  insuranceCents?: Cents;
  minPaymentMethod?: AmortizationMethod;
  singleInstallmentInterestFree?: boolean;
  firstPeriodInterest?: FirstPeriodInterest;
}

/** La tasa vigente de un producto. Los decimales van como texto: son exactos, un number los redondearía. */
export interface CurrentRate {
  effectiveFrom: IsoDate;
  ea: string;
  mv: string;
}

/** Lo que la app necesita para mostrar y editar una tarjeta. */
export interface CardSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  creditLimitCents: Cents;
  cutDay: number;
  dueDay: number;
  handlingFeeCents: Cents;
  insuranceCents: Cents;
  minPaymentMethod: AmortizationMethod;
  singleInstallmentInterestFree: boolean;
  firstPeriodInterest: FirstPeriodInterest;
  /** Null si no hay ninguna tasa que ya rija (p. ej. la única empieza mañana). */
  currentRate: CurrentRate | null;
  /** La próxima tasa programada (la de menor fecha que todavía no rige); null si no hay. */
  nextRate: CurrentRate | null;
}

@Injectable()
export class CardsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea el producto, la tarjeta y su primera tasa en una sola transacción. */
  async create(input: CreateCardInput): Promise<Product> {
    // Primero la tasa: si es inválida, ni se abre la transacción
    const rate = resolveRate({ ea: input.rate.ea, mv: input.rate.mv });

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Siempre con este manager: solo lo que pasa por él queda dentro de la transacción
        const product = await manager.save(Product, {
          kind: 'credit_card',
          name: input.name,
          bank: input.bank,
          last4: input.last4,
        });

        await manager.save(CreditCard, {
          productId: product.id,
          creditLimitCents: input.creditLimitCents,
          cutDay: input.cutDay,
          dueDay: input.dueDay,
          ...(input.handlingFeeCents !== undefined && { handlingFeeCents: input.handlingFeeCents }),
          ...(input.insuranceCents !== undefined && { insuranceCents: input.insuranceCents }),
          ...(input.minPaymentMethod !== undefined && { minPaymentMethod: input.minPaymentMethod }),
          ...(input.singleInstallmentInterestFree !== undefined && {
            singleInstallmentInterestFree: input.singleInstallmentInterestFree,
          }),
          ...(input.firstPeriodInterest !== undefined && { firstPeriodInterest: input.firstPeriodInterest }),
        });

        await manager.save(ProductRate, {
          productId: product.id,
          effectiveFrom: input.rate.effectiveFrom,
          ea: rate.ea,
          mv: rate.mv,
          source: rate.source,
        });

        return product;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Ya existe una tarjeta de ${input.bank} terminada en ${input.last4}`);
      }
      throw err;
    }
  }

  /** Las tarjetas activas, por nombre, cada una con su tasa vigente hoy. */
  async listActive(today: IsoDate = isoDateOf()): Promise<CardSummary[]> {
    const products = await this.dataSource.getRepository(Product).find({
      where: { kind: 'credit_card', active: true },
      order: { name: 'ASC' },
    });
    // Con pocas tarjetas basta traerlas todas; si crece, se filtra en la consulta
    const cards = new Map((await this.dataSource.getRepository(CreditCard).find()).map((c) => [c.productId, c]));
    const rates = await this.dataSource.getRepository(ProductRate).find();

    return products.flatMap((product) => {
      const card = cards.get(product.id);
      if (!card) return [];
      return [
        {
          id: product.id,
          name: product.name,
          bank: product.bank,
          last4: product.last4,
          creditLimitCents: card.creditLimitCents,
          cutDay: card.cutDay,
          dueDay: card.dueDay,
          handlingFeeCents: card.handlingFeeCents,
          insuranceCents: card.insuranceCents,
          minPaymentMethod: card.minPaymentMethod,
          singleInstallmentInterestFree: card.singleInstallmentInterestFree,
          firstPeriodInterest: card.firstPeriodInterest,
          currentRate: currentRateOf(
            rates.filter((r) => r.productId === product.id),
            today,
          ),
          nextRate: nextRateOf(
            rates.filter((r) => r.productId === product.id),
            today,
          ),
        },
      ];
    });
  }

  /** Edita solo lo que llega. El nombre vive en product y el resto en credit_card: van en una transacción. */
  async update(id: number, input: UpdateCardInput): Promise<{ id: number }> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOneBy(Product, { id });
      const card = product?.kind === 'credit_card' ? await manager.findOneBy(CreditCard, { productId: id }) : null;
      if (!product || !card) throw new NotFoundException(`La tarjeta ${id} no existe`);

      const { name, ...cardFields } = input;
      const changes = definedOnly(cardFields);
      if (name !== undefined) await manager.save(Product, { ...product, name });
      if (Object.keys(changes).length > 0) await manager.save(CreditCard, { ...card, ...changes });
      return { id };
    });
  }
}

/** La tasa que rige hoy: la de mayor effectiveFrom que ya empezó. Una futura todavía no cuenta. */
export function currentRateOf(rates: readonly ProductRate[], today: IsoDate): CurrentRate | null {
  let best: ProductRate | undefined;
  for (const rate of rates) {
    if (rate.effectiveFrom <= today && (best === undefined || rate.effectiveFrom > best.effectiveFrom)) best = rate;
  }
  return best === undefined
    ? null
    : { effectiveFrom: best.effectiveFrom, ea: best.ea.toFixed(), mv: best.mv.toFixed() };
}

/** La próxima tasa programada: la de menor effectiveFrom que es posterior a hoy. */
export function nextRateOf(rates: readonly ProductRate[], today: IsoDate): CurrentRate | null {
  let next: ProductRate | undefined;
  for (const rate of rates) {
    if (rate.effectiveFrom > today && (next === undefined || rate.effectiveFrom < next.effectiveFrom)) next = rate;
  }
  return next === undefined
    ? null
    : { effectiveFrom: next.effectiveFrom, ea: next.ea.toFixed(), mv: next.mv.toFixed() };
}
