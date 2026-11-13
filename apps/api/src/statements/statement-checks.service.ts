import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { isUniqueViolation } from '../common/pg-errors';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { StatementCheck } from '../products/entities/statement-check.entity';
import { Settings } from '../settings/entities/settings.entity';
import { type StatementCheckInput, type StatementCheckResult, buildStatementCheck } from './build-statement-check';

export interface StatementCheckRequest extends StatementCheckInput {
  cardId: number;
}

export interface StatementCheckResponse extends StatementCheckResult {
  /** El id del registro guardado. */
  id: number;
}

/** Busca la tarjeta y sus filas, llama a buildStatementCheck y guarda el resultado. */
@Injectable()
export class StatementChecksService {
  constructor(private readonly dataSource: DataSource) {}

  async create(userId: number, request: StatementCheckRequest): Promise<StatementCheckResponse> {
    const { cardId, ...input } = request;
    const db = this.dataSource;

    // El producto debe ser del usuario: la tarjeta de otra persona responde 404, igual que una que no existe
    const product = await db.getRepository(Product).findOneBy({ id: cardId, userId });
    if (!product) throw new NotFoundException(`La tarjeta ${cardId} no existe`);
    const card = await db.getRepository(CreditCard).findOneBy({ productId: cardId });
    if (!card) throw new BadRequestException(`El producto ${cardId} no es una tarjeta de crédito`);

    const settings = await db.getRepository(Settings).findOneBy({ userId });
    if (!settings) throw new InternalServerErrorException('Falta la fila de ajustes: ¿se corrieron las migraciones?');

    const [rates, expenses, capitalPayments, fixedExpenses] = await Promise.all([
      db.getRepository(ProductRate).find({ where: { userId, productId: cardId } }),
      db.getRepository(Expense).find({ where: { userId, sourceProductId: cardId } }),
      db.getRepository(CapitalPayment).find({ where: { userId, productId: cardId } }),
      db.getRepository(FixedExpense).find({ where: { userId } }),
    ]);

    const result = buildStatementCheck(
      { card, rates, expenses, capitalPayments, fixedExpenses, settings },
      input,
      isoDateOf(),
    );

    try {
      const saved = await db.getRepository(StatementCheck).save({
        userId,
        productId: cardId,
        cutDate: input.cutDate,
        dueDate: result.statement.dueDate,
        statementMinimumCents: input.statementMinimumCents,
        statementTotalCents: input.statementTotalCents ?? null,
        calculatedMinimumCents: result.check.calculatedMinimum,
        withinTolerance: result.check.withinTolerance,
      });
      return { id: saved.id, ...result };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`El corte del ${input.cutDate} de la tarjeta ${cardId} ya lo validaste`);
      }
      throw err;
    }
  }
}
