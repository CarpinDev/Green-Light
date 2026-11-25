import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementsModule } from '../movements/movements.module';
import { DebtPaymentsService } from './debt-payments.service';
import { DebtPayment } from './entities/debt-payment.entity';
import { RecurringConfirmation } from './entities/recurring-confirmation.entity';
import { PaymentsController } from './payments.controller';
import { RecurringConfirmationsService } from './recurring-confirmations.service';

@Module({
  imports: [TypeOrmModule.forFeature([DebtPayment, RecurringConfirmation]), MovementsModule],
  controllers: [PaymentsController],
  providers: [DebtPaymentsService, RecurringConfirmationsService],
})
export class PaymentsModule {}
