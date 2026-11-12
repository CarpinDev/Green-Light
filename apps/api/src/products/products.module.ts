import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CardDebtController } from './card-debt.controller';
import { CardPlanService } from './card-plan.service';
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
import { OpeningDebtService } from './opening-debt.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductRate, CreditCard, Loan, Account, AccountBalance, StatementCheck]),
  ],
  controllers: [CardsController, CardDebtController, LoansController, AccountsController, ProductsController],
  providers: [CardsService, CardPlanService, OpeningDebtService, LoansService, AccountsService, ProductsService],
  exports: [CardsService, LoansService, AccountsService],
})
export class ProductsModule {}
