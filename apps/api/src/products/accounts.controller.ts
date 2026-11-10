import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';
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

  /** Confirma un saldo nuevo. 404 si el id no es una cuenta; 409 si ya hay uno en esa fecha. */
  @Post('accounts/:id/balances')
  async confirmBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmBalanceDto,
  ): Promise<{ id: number }> {
    const { id: balanceId } = await this.accounts.confirmBalance(id, dto);
    return { id: balanceId };
  }
}
