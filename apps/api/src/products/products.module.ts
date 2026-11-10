import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { CreditCard } from './entities/credit-card.entity';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductRate,
      CreditCard,
      Loan,
      Account,
      AccountBalance,
    ]),
  ],
})
export class ProductsModule {}
