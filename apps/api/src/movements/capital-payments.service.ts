import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Cents, type IsoDate, type PrepaymentMode, payoffAmount } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { formatCop } from '../common/format-cop';
import { toEngineLoan, toLoanPrepayment } from '../projection/mappers';
import { abonableDebt } from '../products/abonable-debt';
import { loadCardPlanFacts } from '../products/card-plan-facts';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { assertCardProduct } from '../products/product-checks';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Expense } from './entities/expense.entity';

export interface CreateCapitalPaymentInput {
  /** La tarjeta o el préstamo al que se abona. */
  productId: number;
  date: IsoDate;
  amountCents: Cents;
  /** Si falta, la base usa reduce_term (misma cuota, menos meses). */
  mode?: PrepaymentMode;
  /** Compra de esa tarjeta a la que se abona. Sin ella, el motor reparte por mayor tasa. */
  expenseId?: number;
  /** La cuenta de la que sale el dinero. No se combina con `external`. */
  sourceAccountId?: number;
  /** Dinero que no pasa por las cuentas (va directo al banco): baja la deuda pero no el saldo. */
  external?: boolean;
}

/** De dónde salió el dinero de un abono, para mostrarlo. */
export type CapitalPaymentSource =
  { kind: 'account'; id: number; name: string; last4: string } | { kind: 'external' } | null;

export interface CapitalPaymentSummary {
  id: number;
  date: IsoDate;
  amountCents: Cents;
  mode: PrepaymentMode;
  source: CapitalPaymentSource;
}

@Injectable()
export class CapitalPaymentsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Guarda un abono extra a capital. Valida todo antes de escribir. */
  async create(input: CreateCapitalPaymentInput): Promise<CapitalPayment> {
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: input.productId });
    if (!product) throw new BadRequestException(`El producto ${input.productId} no existe`);
    if (!product.active) {
      throw new BadRequestException(`El producto ${product.id} está desactivado: no admite abonos nuevos`);
    }
    if (product.kind === 'account') {
      throw new BadRequestException(`El producto ${product.id} es una cuenta: solo se abona a tarjetas y préstamos`);
    }

    if (input.sourceAccountId !== undefined && input.external === true) {
      throw new BadRequestException('El dinero del abono sale de una cuenta o es externo, no de las dos');
    }
    if (input.sourceAccountId !== undefined) await this.assertActiveAccount(input.sourceAccountId);

    if (input.expenseId !== undefined) {
      if (product.kind === 'loan') {
        throw new BadRequestException(
          'Un abono a un préstamo no puede apuntar a una compra: los préstamos no tienen compras',
        );
      }
      await this.assertPurchaseOf(product.id, input.expenseId, input.date);
    }
    await this.assertWithinDebt(product, input);

    return this.dataSource.getRepository(CapitalPayment).save({
      productId: input.productId,
      date: input.date,
      amountCents: input.amountCents,
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.expenseId !== undefined && { expenseId: input.expenseId }),
      ...(input.sourceAccountId !== undefined && { sourceAccountId: input.sourceAccountId }),
      ...(input.external === true && { isExternal: true }),
    });
  }

  /** Los abonos de una tarjeta, del más reciente al más viejo, con el origen del dinero. */
  async listOfCard(cardId: number): Promise<CapitalPaymentSummary[]> {
    const db = this.dataSource;
    assertCardProduct(await db.getRepository(Product).findOneBy({ id: cardId }), cardId);
    const [payments, products] = await Promise.all([
      db.getRepository(CapitalPayment).find({
        where: { productId: cardId },
        order: { date: 'DESC', createdAt: 'DESC', id: 'DESC' },
      }),
      db.getRepository(Product).find(),
    ]);

    return payments.map((p) => {
      const account = p.sourceAccountId === null ? undefined : products.find((x) => x.id === p.sourceAccountId);
      return {
        id: p.id,
        date: p.date,
        amountCents: p.amountCents,
        mode: p.mode,
        source: p.isExternal
          ? { kind: 'external' as const }
          : account === undefined
            ? null
            : { kind: 'account' as const, id: account.id, name: account.name, last4: account.last4 },
      };
    });
  }

  /**
   * Borra un abono (para corregir uno mal puesto). Es seguro porque nada guarda un resultado del abono: el plan,
   * los intereses y la proyección se recalculan siempre desde los datos, y ninguna otra tabla apunta a él.
   */
  async remove(id: number): Promise<void> {
    const { affected } = await this.dataSource.getRepository(CapitalPayment).delete({ id });
    if (!affected) throw new NotFoundException(`El abono ${id} no existe`);
  }

  /** La cuenta debe existir, ser una cuenta y estar activa. */
  private async assertActiveAccount(accountId: number): Promise<void> {
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: accountId });
    if (!product || product.kind !== 'account') throw new BadRequestException(`La cuenta ${accountId} no existe`);
    if (!product.active) throw new BadRequestException(`La cuenta ${accountId} está desactivada`);
  }

  /** El monto no puede pasar de lo que todavía se puede abonar: lo que no está facturado (tarjeta) o el saldo (préstamo). */
  private async assertWithinDebt(product: Product, input: CreateCapitalPaymentInput): Promise<void> {
    const limit =
      product.kind === 'credit_card'
        ? abonableDebt(await loadCardPlanFacts(this.dataSource, product.id), input.date, input.expenseId)
        : await this.loanBalance(product.id, input.date);

    if (input.amountCents > limit) {
      throw new BadRequestException(
        limit === 0
          ? 'No hay deuda para abonar en esa fecha: lo que debes ya está facturado.'
          : `Solo puedes abonar hasta ${formatCop(limit)}: ${
              product.kind === 'credit_card' ? 'es lo que todavía no está facturado' : 'es lo que debes del préstamo'
            }.`,
      );
    }
  }

  private async loanBalance(loanId: number, date: IsoDate): Promise<Cents> {
    const db = this.dataSource;
    const loan = await db.getRepository(Loan).findOneBy({ productId: loanId });
    if (!loan) throw new NotFoundException(`El préstamo ${loanId} no tiene datos de préstamo`);
    const [rates, payments] = await Promise.all([
      db.getRepository(ProductRate).find({ where: { productId: loanId } }),
      db.getRepository(CapitalPayment).find({ where: { productId: loanId } }),
    ]);
    return payoffAmount(toEngineLoan(loan, rates), date, payments.filter((p) => p.date <= date).map(toLoanPrepayment));
  }

  /** La compra debe existir, ser de esta tarjeta y no ser posterior al abono. */
  private async assertPurchaseOf(cardId: number, expenseId: number, paymentDate: IsoDate): Promise<void> {
    const expense = await this.dataSource.getRepository(Expense).findOneBy({ id: expenseId });
    if (!expense) throw new BadRequestException(`La compra ${expenseId} no existe`);
    if (expense.sourceProductId !== cardId) {
      throw new BadRequestException(
        `La compra ${expenseId} es de la tarjeta ${expense.sourceProductId}, no de la tarjeta ${cardId}`,
      );
    }
    // Fechas YYYY-MM-DD: se comparan como texto. El mismo día de la compra sí se puede abonar
    if (paymentDate < expense.date) {
      throw new BadRequestException(
        `El abono (${paymentDate}) es antes de la compra (${expense.date}): no se abona lo que todavía no se debe`,
      );
    }
  }
}
