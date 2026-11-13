import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CheckStatementDto } from './dto/check-statement.dto';
import { type StatementCheckResponse, StatementChecksService } from './statement-checks.service';

@Controller('statement-checks')
export class StatementChecksController {
  constructor(private readonly checks: StatementChecksService) {}

  /** Responde 201 con el id guardado, el extracto del motor y la comparación con el mínimo del banco. */
  @Post()
  create(@CurrentUser() userId: number, @Body() dto: CheckStatementDto): Promise<StatementCheckResponse> {
    return this.checks.create(userId, dto);
  }
}
