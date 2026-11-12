import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { type CapitalPaymentSummary, CapitalPaymentsService } from './capital-payments.service';
import { CreateCapitalPaymentDto } from './dto/create-capital-payment.dto';

@Controller()
export class CapitalPaymentsController {
  constructor(private readonly capitalPayments: CapitalPaymentsService) {}

  /** Responde 201 con solo el id. 400 si el monto pasa de la deuda abonable. */
  @Post('capital-payments')
  async create(@Body() dto: CreateCapitalPaymentDto): Promise<{ id: number }> {
    const { id } = await this.capitalPayments.create(dto);
    return { id };
  }

  /** Los abonos de una tarjeta, del más reciente al más viejo. */
  @Get('cards/:id/capital-payments')
  listOfCard(@Param('id', ParseIntPipe) id: number): Promise<CapitalPaymentSummary[]> {
    return this.capitalPayments.listOfCard(id);
  }

  /** Borra un abono mal puesto. 204; 404 si no existe. */
  @Delete('capital-payments/:id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.capitalPayments.remove(id);
  }
}
