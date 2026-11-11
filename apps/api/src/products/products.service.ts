import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Product } from './entities/product.entity';
import type { ProductKind } from './product-kind';

/** Lo que la app necesita para elegir un producto: no la entidad completa. */
export interface ProductSummary {
  id: number;
  /** La app lo usa para saber si es una tarjeta (cuotas, extracto). */
  kind: ProductKind;
  name: string;
  bank: string;
  last4: string;
}

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
}
