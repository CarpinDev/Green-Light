import { Body, Controller, Post } from '@nestjs/common';
import { CreateLoanDto } from './dto/create-loan.dto';
import { LoansService } from './loans.service';

@Controller()
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  /** Responde 201 con solo el id. */
  @Post('loans')
  async create(@Body() dto: CreateLoanDto): Promise<{ id: number }> {
    const { id } = await this.loans.create(dto);
    return { id };
  }
}
