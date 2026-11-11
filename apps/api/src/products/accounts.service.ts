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

/** Lo que la app necesita para confirmar saldos: la cuenta y su último saldo. */
export interface AccountSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  latestBalance: { asOf: IsoDate; balanceCents: Cents } | null;
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

  /** Las cuentas activas, por nombre, cada una con su saldo confirmado más reciente (null si no tiene). */
  async listActive(): Promise<AccountSummary[]> {
    const products = await this.dataSource.getRepository(Product).find({
      where: { kind: 'account', active: true },
      order: { name: 'ASC' },
    });
    // Del más nuevo al más viejo: el primero que aparece de cada cuenta es su último saldo.
    // Con pocas cuentas basta traerlos todos; si crece, se filtra en la consulta.
    const balances = await this.dataSource.getRepository(AccountBalance).find({ order: { asOf: 'DESC' } });
    const latest = new Map<number, AccountBalance>();
    for (const balance of balances) {
      if (!latest.has(balance.productId)) latest.set(balance.productId, balance);
    }

    return products.map(({ id, name, bank, last4 }) => {
      const balance = latest.get(id);
      return {
        id,
        name,
        bank,
        last4,
        latestBalance: balance ? { asOf: balance.asOf, balanceCents: balance.balanceCents } : null,
      };
    });
  }

  /**
   * Confirma el saldo de una cuenta en una fecha; el último es el punto de partida de la proyección.
   * Si ya había uno ese día lo reemplaza: confirmar en la mañana y corregir en la tarde es lo normal.
   */
  async confirmBalance(accountId: number, input: ConfirmBalanceInput): Promise<AccountBalance> {
    // Account solo existe para productos que son cuentas: un préstamo o una tarjeta también dan 404
    const account = await this.dataSource.getRepository(Account).findOneBy({ productId: accountId });
    if (!account) throw new NotFoundException(`No existe la cuenta ${accountId}`);

    const balances = this.dataSource.getRepository(AccountBalance);
    const sameDay = await balances.findOneBy({ productId: accountId, asOf: input.asOf });
    return balances.save({
      // Con el id guardado, save actualiza esa fila en vez de insertar otra
      ...(sameDay && { id: sameDay.id }),
      productId: accountId,
      asOf: input.asOf,
      balanceCents: input.balanceCents,
    });
  }
}
