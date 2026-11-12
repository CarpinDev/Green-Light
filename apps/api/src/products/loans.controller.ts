import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import type { LoanDetail, LoanSummary } from './build-loan-view';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { PrepaymentPreviewDto } from './dto/prepayment-preview.dto';
import { type LoanPrepaymentPreview, LoansService } from './loans.service';

@Controller()
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  /** Responde 201 con solo el id. */
  @Post('loans')
  async create(@Body() dto: CreateLoanDto): Promise<{ id: number }> {
    const { id } = await this.loans.create(dto);
    return { id };
  }

  /** Los préstamos activos con su saldo, su próxima cuota y cuántas faltan. */
  @Get('loans')
  list(): Promise<LoanSummary[]> {
    return this.loans.listActive();
  }

  /** Un préstamo con su cronograma. 404 si no existe o no es un préstamo. */
  @Get('loans/:id')
  get(@Param('id', ParseIntPipe) id: number): Promise<LoanDetail> {
    return this.loans.get(id);
  }

  /** Cómo quedaría el préstamo con un abono (sin guardarlo): cuota, cuotas restantes y fecha de fin. */
  @Post('loans/:id/prepayment-preview')
  @HttpCode(200)
  previewPrepayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrepaymentPreviewDto,
  ): Promise<LoanPrepaymentPreview> {
    return this.loans.previewPrepayment(id, dto);
  }

  /** Nombre, banco, últimos 4, cuota del banco y seguro. El capital, las cuotas y la primera fecha no se editan. */
  @Patch('loans/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoanDto): Promise<{ id: number }> {
    return this.loans.update(id, dto);
  }
}
