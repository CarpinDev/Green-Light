import { ConflictException, Injectable } from '@nestjs/common';
import type { AmortizationMethod, Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../common/pg-errors';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { type RateInput, resolveRate } from './resolve-rate';

export interface CreateLoanInput {
  name: string;
  bank: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  last4: string;
  /** O el saldo actual si el préstamo ya existía. */
  principalCents: Cents;
  /** O las cuotas que faltan. */
  termMonths: number;
  firstPaymentDate: IsoDate;
  /** Primera tasa del préstamo: la E.A., la M.V. o las dos. */
  rate: RateInput & { effectiveFrom: IsoDate };
  /** Cuota que informa el banco; debe ser mayor que 0. Si falta, el motor la calcula. */
  fixedPaymentCents?: Cents;
  insuranceCents?: Cents;
  method?: AmortizationMethod;
}

@Injectable()
export class LoansService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea el producto, el préstamo y su primera tasa en una sola transacción. */
  async create(input: CreateLoanInput): Promise<Product> {
    // Primero la tasa: si es inválida, ni se abre la transacción
    const rate = resolveRate({ ea: input.rate.ea, mv: input.rate.mv });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const product = await manager.save(Product, {
          kind: 'loan',
          name: input.name,
          bank: input.bank,
          last4: input.last4,
        });

        await manager.save(Loan, {
          productId: product.id,
          principalCents: input.principalCents,
          termMonths: input.termMonths,
          firstPaymentDate: input.firstPaymentDate,
          ...(input.fixedPaymentCents !== undefined && { fixedPaymentCents: input.fixedPaymentCents }),
          ...(input.insuranceCents !== undefined && { insuranceCents: input.insuranceCents }),
          ...(input.method !== undefined && { method: input.method }),
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
        throw new ConflictException(`Ya existe un préstamo de ${input.bank} terminado en ${input.last4}`);
      }
      throw err;
    }
  }
}
