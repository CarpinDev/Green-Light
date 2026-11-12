import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RateDto } from './dto/rate.dto';
import { type ProductSummary, ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Cuentas, tarjetas y préstamos activos: de aquí elige la app de dónde sale un gasto. */
  @Get()
  list(): Promise<ProductSummary[]> {
    return this.products.listActive();
  }

  /** Una tasa nueva en el historial. 201 con el id; 409 si esa fecha ya tiene tasa; 400 si es una cuenta. */
  @Post(':id/rates')
  addRate(@Param('id', ParseIntPipe) id: number, @Body() dto: RateDto): Promise<{ id: number }> {
    return this.products.addRate(id, dto);
  }
}
