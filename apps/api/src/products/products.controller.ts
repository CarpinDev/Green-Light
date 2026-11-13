import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
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
  list(@CurrentUser() userId: number, @Query('archived') archived?: string): Promise<ProductSummary[]> {
    return archived === 'true' ? this.products.listArchived(userId) : this.products.listActive(userId);
  }

  /** Cuánto se borraría con el producto y qué lo bloquea. */
  @Get(':id/usage')
  usage(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<ProductUsage> {
    return this.lifecycle.usage(userId, id);
  }

  /** Elimina el producto con todo lo suyo. 204; 404 si no existe; 409 si un gasto fijo o un ingreso lo usa. */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.lifecycle.remove(userId, id);
  }

  /** Lo saca de las listas y de la proyección, conservando su historial. 409 si todavía se debe. */
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number; active: boolean }> {
    return this.lifecycle.archive(userId, id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  unarchive(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number; active: boolean }> {
    return this.lifecycle.unarchive(userId, id);
  }

  /** Una tasa nueva en el historial. 201 con el id; 409 si esa fecha ya tiene tasa; 400 si es una cuenta. */
  @Post(':id/rates')
  addRate(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RateDto,
  ): Promise<{ id: number; replaced: boolean }> {
    return this.products.addRate(userId, id, dto);
  }
}
