import { ConflictException, Injectable } from '@nestjs/common';
import type { AmortizationMethod, Cents, FirstPeriodInterest, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
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
}
