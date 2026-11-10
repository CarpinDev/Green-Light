import { Body, Controller, Post } from '@nestjs/common';
import { CapitalPaymentsService } from './capital-payments.service';
import { CreateCapitalPaymentDto } from './dto/create-capital-payment.dto';

@Controller()
export class CapitalPaymentsController {
  constructor(private readonly capitalPayments: CapitalPaymentsService) {}

  /** Responde 201 con solo el id. */
  @Post('capital-payments')
  async create(@Body() dto: CreateCapitalPaymentDto): Promise<{ id: number }> {
    const { id } = await this.capitalPayments.create(dto);
    return { id };
  }
}
