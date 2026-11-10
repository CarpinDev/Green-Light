import { BadRequestException, Injectable } from '@nestjs/common';
import type { Cents, IsoDate, PrepaymentMode } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/product.entity';
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

    if (input.expenseId !== undefined) {
      if (product.kind === 'loan') {
        throw new BadRequestException('Un abono a un préstamo no puede apuntar a una compra: los préstamos no tienen compras');
      }
      await this.assertPurchaseOf(product.id, input.expenseId, input.date);
    }

    return this.dataSource.getRepository(CapitalPayment).save({
      productId: input.productId,
      date: input.date,
      amountCents: input.amountCents,
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.expenseId !== undefined && { expenseId: input.expenseId }),
    });
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
