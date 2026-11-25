import { Body, Controller, Delete, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { type DebtPaymentResult, DebtPaymentsService } from './debt-payments.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { CreateRecurringConfirmationDto } from './dto/create-recurring-confirmation.dto';
import { RecurringConfirmationsService } from './recurring-confirmations.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly debtPayments: DebtPaymentsService,
    private readonly recurring: RecurringConfirmationsService,
  ) {}

  /**
   * Confirma el pago de una tarjeta o un préstamo. 201 con el mínimo esperado, el excedente (abono a capital) y el
   * faltante, para que la app avise. 400 si el corte o la cuota no existen; 404 si el producto no es tuyo; 409 si ya
   * estaba confirmado.
   */
  @Post('debt-payments')
  create(@CurrentUser() userId: number, @Body() dto: CreateDebtPaymentDto): Promise<DebtPaymentResult> {
    return this.debtPayments.create(userId, dto);
  }

  /** Deshace la confirmación (y borra su excedente). 204; 404 si no existe o no es tuya. */
  @Delete('debt-payments/:id')
  @HttpCode(204)
  removeDebtPayment(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.debtPayments.remove(userId, id);
  }

  /** Confirma que llegó un salario o se pagó un gasto fijo. 201 con el id; 409 si esa fecha ya estaba confirmada. */
  @Post('recurring-confirmations')
  async createRecurring(
    @CurrentUser() userId: number,
    @Body() dto: CreateRecurringConfirmationDto,
  ): Promise<{ id: number }> {
    const { id } = await this.recurring.create(userId, dto);
    return { id };
  }

  @Delete('recurring-confirmations/:id')
  @HttpCode(204)
  removeRecurring(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.recurring.remove(userId, id);
  }
}
