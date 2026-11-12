import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import type { ProductKind } from './product-kind';
import { type RateInput, resolveRate } from './resolve-rate';

/** Lo que la app necesita para elegir un producto: no la entidad completa. */
export interface ProductSummary {
  id: number;
  /** La app lo usa para saber si es una tarjeta (cuotas, extracto). */
  kind: ProductKind;
  name: string;
  bank: string;
  last4: string;
}

/** Una tasa nueva para el historial: la E.A., la M.V. o las dos, desde una fecha. */
export type AddRateInput = RateInput & { effectiveFrom: IsoDate };

@Injectable()
export class ProductsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Los productos activos, ordenados por nombre. */
  async listActive(): Promise<ProductSummary[]> {
    const products = await this.dataSource.getRepository(Product).find({
      where: { active: true },
      order: { name: 'ASC' },
    });
    return products.map(({ id, kind, name, bank, last4 }) => ({ id, kind, name, bank, last4 }));
  }

  /**
   * Agrega una tasa al historial (las variables cambian mes a mes). Sirve para tarjetas y préstamos;
   * una cuenta no tiene tasa. Si ya hay una con esa misma fecha, la corrige (`replaced: true`).
   */
  async addRate(productId: number, input: AddRateInput): Promise<{ id: number; replaced: boolean }> {
    const repository = this.dataSource.getRepository(Product);
    const product = await repository.findOneBy({ id: productId });
    if (!product) throw new NotFoundException(`El producto ${productId} no existe`);
    if (product.kind === 'account') {
      throw new BadRequestException(`El producto ${productId} es una cuenta: las cuentas no tienen tasa`);
    }

    const rate = resolveRate({ ea: input.ea, mv: input.mv });
    const values = { ea: rate.ea, mv: rate.mv, source: rate.source };
    const rates = this.dataSource.getRepository(ProductRate);

    // Una tasa con la misma fecha se corrige (como RateHistory.add del motor): así se arregla una mal puesta
    const existing = await rates.findOneBy({ productId, effectiveFrom: input.effectiveFrom });
    if (existing) {
      await rates.save({ ...existing, ...values });
      return { id: existing.id, replaced: true };
    }
    const saved = await rates.save({ productId, effectiveFrom: input.effectiveFrom, ...values });
    return { id: saved.id, replaced: false };
  }
}
