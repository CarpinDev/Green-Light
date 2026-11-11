import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { type AccountSummary, AccountsService } from './accounts.service';
import { ConfirmBalanceDto } from './dto/confirm-balance.dto';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Responde 201 con solo el id. */
  @Post('accounts')
  async create(@Body() dto: CreateAccountDto): Promise<{ id: number }> {
    const { id } = await this.accounts.create(dto);
    return { id };
  }

  /** Cuentas activas con su último saldo: de aquí sale "tenías $X al 2 de octubre". */
  @Get('accounts')
  list(): Promise<AccountSummary[]> {
    return this.accounts.listActive();
  }

  /** Confirma un saldo. 404 si el id no es una cuenta. Si ya había uno en esa fecha, lo reemplaza. */
  @Post('accounts/:id/balances')
  async confirmBalance(@Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmBalanceDto): Promise<{ id: number }> {
    const { id: balanceId } = await this.accounts.confirmBalance(id, dto);
    return { id: balanceId };
  }
}
