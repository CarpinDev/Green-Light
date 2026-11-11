import { Controller, Get } from '@nestjs/common';
import { type ProductSummary, ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Cuentas, tarjetas y préstamos activos: de aquí elige la app de dónde sale un gasto. */
  @Get()
  list(): Promise<ProductSummary[]> {
    return this.products.listActive();
  }
}
