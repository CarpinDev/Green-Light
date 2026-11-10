import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductRate, CreditCard])],
})
export class ProductsModule {}
