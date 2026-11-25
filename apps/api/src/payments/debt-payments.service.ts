import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cents, IsoDate, PrepaymentMode } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { isUniqueViolation } from '../common/pg-errors';
import { CapitalPaymentsService } from '../movements/capital-payments.service';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { loadCardPlanFacts } from '../products/card-plan-facts';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { DebtPayment } from './entities/debt-payment.entity';
import { type ExpectedPayment, expectedCardPayment, expectedLoanPayment, splitPayment } from './expected-payment';

export interface CreateDebtPaymentInput {
  /** La tarjeta o el préstamo que se pagó. */
  productId: number;
  /** Qué pago esperado es: el corte de la tarjeta o la fecha de la cuota del préstamo. */
  scheduledDate: IsoDate;
  /** El día en que se pagó de verdad (no puede ser futuro). */
  paidDate: IsoDate;
  /** Todo lo pagado, incluido lo que pase del mínimo. */
  amountCents: Cents;
  /** La cuenta de la que salió. No se combina con `external`. */
  sourceAccountId?: number;
  /** Plata que no pasa por las cuentas. No se combina con `sourceAccountId`. */
  external?: boolean;
  /** Cómo se aplica el excedente (si lo hay). Si falta, reduce_term. */
  mode?: PrepaymentMode;
}

export interface DebtPaymentResult {
  id: number;
  /** Lo que se esperaba pagar como mínimo en ese corte o cuota. */
  minimumCents: Cents;
  /** Lo que pasó del mínimo: se guardó como un abono a capital ligado al pago. */
  excessCents: Cents;
  /** Lo que faltó para el mínimo: la proyección lo cobra en la siguiente fecha límite. */
  shortfallCents: Cents;
}

const ALREADY_CONFIRMED = 'Ese pago ya está confirmado, bórralo para corregirlo';

/**
 * Confirma que una tarjeta o un préstamo se pagó (cuándo, cuánto y de dónde) para que la proyección use eso y no lo
 * supuesto. El excedente sobre el mínimo se guarda como un `capital_payment` ligado al pago, así se reutiliza todo
 * lo de los abonos (reparto por mayor tasa, tope de deuda abonable, intereses) sin duplicar esa lógica.
 */
@Injectable()
export class DebtPaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly capitalPayments: CapitalPaymentsService,
  ) {}

  async create(
    userId: number,
    input: CreateDebtPaymentInput,
    today: IsoDate = isoDateOf(),
  ): Promise<DebtPaymentResult> {
    if (input.sourceAccountId !== undefined && input.external === true) {
      throw new BadRequestException('El dinero del pago sale de una cuenta o es externo, no de las dos');
    }
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: input.productId, userId });
    if (!product) throw new NotFoundException(`El producto ${input.productId} no existe`);
    if (product.kind === 'account') {
      throw new BadRequestException(
        `El producto ${product.id} es una cuenta: solo se confirman pagos de tarjetas y préstamos`,
      );
    }
    if (input.paidDate > today) {
      throw new BadRequestException(`El pago es del ${input.paidDate}, que todavía no llega: confírmalo cuando pase`);
    }

    const expected = await this.expectedPayment(userId, product, input.scheduledDate);
    if (product.kind === 'credit_card' && input.paidDate < input.scheduledDate) {
      throw new BadRequestException(
        `El pago (${input.paidDate}) es antes del corte (${input.scheduledDate}): aún no había extracto`,
      );
    }
    const already = await this.dataSource
      .getRepository(DebtPayment)
      .findOneBy({ productId: product.id, scheduledDate: input.scheduledDate });
    if (already) throw new ConflictException(ALREADY_CONFIRMED);

    const { excessCents, shortfallCents } = splitPayment(input.amountCents, expected.minimumCents);
    // El excedente es un abono normal: origen, tope de deuda y mensajes son los de los abonos. Se valida SIEMPRE,
    // también sin excedente, para que un origen inválido falle igual y antes de escribir.
    const excess = {
      productId: product.id,
      date: input.paidDate,
      amountCents: excessCents,
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.sourceAccountId !== undefined && { sourceAccountId: input.sourceAccountId }),
      ...(input.external === true && { external: true }),
    };
    await this.capitalPayments.validate(userId, excess);

    try {
      // Una transacción: el pago y su excedente van juntos o no queda ninguno
      const saved = await this.dataSource.transaction(async (manager) => {
        const payment = await manager.save(DebtPayment, {
          userId,
          productId: product.id,
          scheduledDate: input.scheduledDate,
          paidDate: input.paidDate,
          amountCents: input.amountCents,
          ...(input.sourceAccountId !== undefined && { sourceAccountId: input.sourceAccountId }),
          ...(input.external === true && { isExternal: true }),
        });
        if (excessCents > 0) {
          await manager.save(CapitalPayment, this.capitalPayments.toRow(userId, excess, payment.id));
        }
        return payment;
      });
      return { id: saved.id, minimumCents: expected.minimumCents, excessCents, shortfallCents };
    } catch (err) {
      // Dos confirmaciones a la vez: gana una y la otra choca con el índice único
      if (isUniqueViolation(err)) throw new ConflictException(ALREADY_CONFIRMED);
      throw err;
    }
  }

  /** Borra el pago y, por el CASCADE de la base, el abono a capital de su excedente. */
  async remove(userId: number, id: number): Promise<void> {
    const repo = this.dataSource.getRepository(DebtPayment);
    // El userId en el delete: el pago de otra persona no coincide y responde 404 sin borrar nada
    const { affected } = await repo.delete({ id, userId });
    if (!affected) throw new NotFoundException(`El pago ${id} no existe`);
  }

  /** Lo que se esperaba pagar en esa fecha programada; 400 si no es un corte o una cuota real del producto. */
  private async expectedPayment(userId: number, product: Product, scheduledDate: IsoDate): Promise<ExpectedPayment> {
    if (product.kind === 'credit_card') {
      const facts = await loadCardPlanFacts(this.dataSource, userId, product.id);
      const expected = expectedCardPayment(facts, scheduledDate);
      if (!expected) {
        throw new BadRequestException(`El ${scheduledDate} no es un corte de esta tarjeta con algo por pagar`);
      }
      return expected;
    }

    const db = this.dataSource;
    const loan = await db.getRepository(Loan).findOneBy({ productId: product.id });
    if (!loan) throw new NotFoundException(`El préstamo ${product.id} no tiene datos de préstamo`);
    const [rates, payments] = await Promise.all([
      db.getRepository(ProductRate).find({ where: { userId, productId: product.id } }),
      db.getRepository(CapitalPayment).find({ where: { userId, productId: product.id } }),
    ]);
    const expected = expectedLoanPayment(loan, rates, payments, scheduledDate);
    if (!expected) throw new BadRequestException(`El ${scheduledDate} no es la fecha de una cuota de este préstamo`);
    return expected;
  }
}
