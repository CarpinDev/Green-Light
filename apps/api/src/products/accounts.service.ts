import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../common/pg-errors';
import type { AccountType } from './account-type';
import { AccountBalance } from './entities/account-balance.entity';
import { Account } from './entities/account.entity';
import { Product } from './entities/product.entity';

export interface CreateAccountInput {
  name: string;
  bank: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  last4: string;
  accountType: AccountType;
  /** Saldo con el que se abre; puede ser negativo (sobregiro). Va junto con `asOf`. */
  openingBalanceCents?: Cents;
  asOf?: IsoDate;
}

export interface ConfirmBalanceInput {
  asOf: IsoDate;
  /** Puede ser negativo (sobregiro). */
  balanceCents: Cents;
}

@Injectable()
export class AccountsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea el producto y la cuenta; con saldo inicial, también su primera fila de saldo. */
  async create(input: CreateAccountInput): Promise<Product> {
    const hasBalance = input.openingBalanceCents !== undefined;
    if (hasBalance !== (input.asOf !== undefined)) {
      throw new BadRequestException('El saldo inicial y su fecha (asOf) van juntos: envía los dos o ninguno');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const product = await manager.save(Product, {
          kind: 'account',
          name: input.name,
          bank: input.bank,
          last4: input.last4,
        });

        await manager.save(Account, { productId: product.id, accountType: input.accountType });

        if (input.openingBalanceCents !== undefined && input.asOf !== undefined) {
          await manager.save(AccountBalance, {
            productId: product.id,
            asOf: input.asOf,
            balanceCents: input.openingBalanceCents,
          });
        }

        return product;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Ya existe una cuenta de ${input.bank} terminada en ${input.last4}`);
      }
      throw err;
    }
  }

  /** Confirma el saldo de una cuenta en una fecha; el último es el punto de partida de la proyección. */
  async confirmBalance(accountId: number, input: ConfirmBalanceInput): Promise<AccountBalance> {
    // Account solo existe para productos que son cuentas: un préstamo o una tarjeta también dan 404
    const account = await this.dataSource.getRepository(Account).findOneBy({ productId: accountId });
    if (!account) throw new NotFoundException(`No existe la cuenta ${accountId}`);

    try {
      return await this.dataSource.getRepository(AccountBalance).save({
        productId: accountId,
        asOf: input.asOf,
        balanceCents: input.balanceCents,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`La cuenta ${accountId} ya tiene un saldo confirmado el ${input.asOf}`);
      }
      throw err;
    }
  }
}
