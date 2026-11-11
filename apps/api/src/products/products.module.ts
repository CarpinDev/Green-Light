import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { CreditCard } from './entities/credit-card.entity';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { StatementCheck } from './entities/statement-check.entity';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductRate, CreditCard, Loan, Account, AccountBalance, StatementCheck]),
  ],
  controllers: [CardsController, LoansController, AccountsController],
  providers: [CardsService, LoansService, AccountsService],
  exports: [CardsService, LoansService, AccountsService],
})
export class ProductsModule {}
