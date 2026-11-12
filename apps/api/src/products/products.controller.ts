import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { RateDto } from './dto/rate.dto';
import { type ProductUsage, ProductLifecycleService } from './product-lifecycle.service';
import { type ProductSummary, ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly lifecycle: ProductLifecycleService,
  ) {}

  /**
   * Cuentas, tarjetas y préstamos activos: de aquí elige la app de dónde sale un gasto.
   * Con `?archived=true`, los archivados (para desarchivarlos).
   */
  @Get()
  list(@Query('archived') archived?: string): Promise<ProductSummary[]> {
    return archived === 'true' ? this.products.listArchived() : this.products.listActive();
  }

  /** Cuánto se borraría con el producto y qué lo bloquea. */
  @Get(':id/usage')
  usage(@Param('id', ParseIntPipe) id: number): Promise<ProductUsage> {
    return this.lifecycle.usage(id);
  }

  /** Elimina el producto con todo lo suyo. 204; 404 si no existe; 409 si un gasto fijo o un ingreso lo usa. */
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.lifecycle.remove(id);
  }

  /** Lo saca de las listas y de la proyección, conservando su historial. 409 si todavía se debe. */
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; active: boolean }> {
    return this.lifecycle.archive(id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  unarchive(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; active: boolean }> {
    return this.lifecycle.unarchive(id);
  }

  /** Una tasa nueva en el historial. 201 con el id; 409 si esa fecha ya tiene tasa; 400 si es una cuenta. */
  @Post(':id/rates')
  addRate(@Param('id', ParseIntPipe) id: number, @Body() dto: RateDto): Promise<{ id: number; replaced: boolean }> {
    return this.products.addRate(id, dto);
  }
}
