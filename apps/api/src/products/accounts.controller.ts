import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { type AccountSummary, AccountsService } from './accounts.service';
import { ConfirmBalanceDto } from './dto/confirm-balance.dto';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Responde 201 con solo el id. */
  @Post('accounts')
  async create(@CurrentUser() userId: number, @Body() dto: CreateAccountDto): Promise<{ id: number }> {
    const { id } = await this.accounts.create(userId, dto);
    return { id };
  }

  /** Cuentas activas con su último saldo: de aquí sale "tenías $X al 2 de octubre". */
  @Get('accounts')
  list(@CurrentUser() userId: number): Promise<AccountSummary[]> {
    return this.accounts.listActive(userId);
  }

  /** Confirma un saldo. 404 si el id no es una cuenta tuya. Si ya había uno en esa fecha, lo reemplaza. */
  @Post('accounts/:id/balances')
  async confirmBalance(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmBalanceDto,
  ): Promise<{ id: number }> {
    const { id: balanceId } = await this.accounts.confirmBalance(userId, id, dto);
    return { id: balanceId };
  }
}
