import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { type CapitalPaymentSummary, CapitalPaymentsService } from './capital-payments.service';
import { CreateCapitalPaymentDto } from './dto/create-capital-payment.dto';

@Controller()
export class CapitalPaymentsController {
  constructor(private readonly capitalPayments: CapitalPaymentsService) {}

  /** Responde 201 con solo el id. 400 si el monto pasa de la deuda abonable; 404 si el producto no es tuyo. */
  @Post('capital-payments')
  async create(@CurrentUser() userId: number, @Body() dto: CreateCapitalPaymentDto): Promise<{ id: number }> {
    const { id } = await this.capitalPayments.create(userId, dto);
    return { id };
  }

  /** Los abonos de una tarjeta, del más reciente al más viejo. */
  @Get('cards/:id/capital-payments')
  listOfCard(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<CapitalPaymentSummary[]> {
    return this.capitalPayments.listOfProduct(userId, id, 'credit_card');
  }

  /** Los abonos de un préstamo, del más reciente al más viejo. */
  @Get('loans/:id/capital-payments')
  listOfLoan(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<CapitalPaymentSummary[]> {
    return this.capitalPayments.listOfProduct(userId, id, 'loan');
  }

  /** Borra un abono mal puesto. 204; 404 si no existe o no es tuyo. */
  @Delete('capital-payments/:id')
  @HttpCode(204)
  remove(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.capitalPayments.remove(userId, id);
  }
}
