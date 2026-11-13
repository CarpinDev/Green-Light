import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { type RateInput, resolveRate } from '../products/resolve-rate';
import { assertCategoryOfKind } from './category-check';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Expense } from './entities/expense.entity';

export interface CreateExpenseInput {
  date: IsoDate;
  amountCents: Cents;
  /** Cuenta (sale del disponible) o tarjeta; nunca un préstamo. */
  sourceProductId: number;
  categoryId?: number;
  description?: string;
  /** Obligatorio con tarjeta (1..72); prohibido con cuenta. */
  installments?: number;
  /** Promoción de esta compra (solo tarjeta), p. ej. 0 % a 12 cuotas. */
  promo?: RateInput & { description?: string };
  /** Deuda previa cargada al empezar a usar la app (solo tarjeta). */
  isOpeningDebt?: boolean;
}

/** Lo que PATCH /expenses/:id puede cambiar: solo la promoción y las cuotas. `promo: null` quita la promoción. */
export interface UpdateExpenseInput {
  installments?: number;
  promo?: (RateInput & { description?: string }) | null;
}

/**
 * Las columnas de un gasto a partir de lo que llegó. La promoción reutiliza resolveRate: una tasa no se
 * valida en dos lugares distintos, y una mala es un 400 antes de escribir nada. Pura: la comparten el alta de
 * un gasto y la deuda inicial de una tarjeta (que escribe varios dentro de una transacción).
 */
export function expenseValues(userId: number, input: CreateExpenseInput): Partial<Expense> {
  const promo = input.promo ? resolveRate({ ea: input.promo.ea, mv: input.promo.mv }) : undefined;

  return {
    userId,
    date: input.date,
    amountCents: input.amountCents,
    sourceProductId: input.sourceProductId,
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.installments !== undefined && { installments: input.installments }),
    ...(promo && {
      promoEa: promo.ea,
      promoMv: promo.mv,
      ...(input.promo?.description !== undefined && { promoDescription: input.promo.description }),
    }),
    ...(input.isOpeningDebt !== undefined && { isOpeningDebt: input.isOpeningDebt }),
  };
}

@Injectable()
export class ExpensesService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Guarda un gasto. Las reglas que cruzan tablas (dependen del tipo del producto de origen)
   * se validan todas antes de escribir: un rechazo no deja nada guardado. Se escribe una sola
   * tabla, así que no hace falta transacción.
   */
  async create(userId: number, input: CreateExpenseInput): Promise<Expense> {
    // El producto debe ser del usuario: el de otra persona responde 404, igual que uno que no existe
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: input.sourceProductId, userId });
    if (!product) throw new NotFoundException(`El producto ${input.sourceProductId} no existe`);
    if (!product.active) {
      throw new BadRequestException(`El producto ${product.id} está desactivado: no admite gastos nuevos`);
    }

    this.assertRulesFor(product, input);
    if (input.categoryId !== undefined) {
      await assertCategoryOfKind(this.dataSource, userId, input.categoryId, 'expense');
    }

    return this.dataSource.getRepository(Expense).save(expenseValues(userId, input));
  }

  /**
   * Borra un gasto mal puesto. El userId va en la consulta: el de otra persona responde 404 igual que uno que no
   * existe. Dos casos no se borran, para no dejar datos a medias:
   *  - Deuda inicial: la maneja el flujo de la tarjeta (reemplaza todos sus grupos juntos); borrar uno suelto
   *    desarmaría la deuda que la tarjeta declaró. Se corrige desde la tarjeta.
   *  - Con abonos hacia esa compra: la llave foránea es RESTRICT; se avisa con un 409 claro en vez de un 500.
   */
  async remove(userId: number, id: number): Promise<void> {
    const expense = await this.dataSource.getRepository(Expense).findOneBy({ id, userId });
    if (!expense) throw new NotFoundException(`El gasto ${id} no existe`);

    if (expense.isOpeningDebt) {
      throw new BadRequestException(
        'Este gasto es la deuda inicial de una tarjeta: se corrige desde la tarjeta, no se borra suelto',
      );
    }
    const payment = await this.dataSource.getRepository(CapitalPayment).findOneBy({ expenseId: id, userId });
    if (payment) {
      throw new ConflictException('Este gasto tiene abonos registrados: elimina primero los abonos y luego el gasto');
    }

    await this.dataSource.getRepository(Expense).delete({ id, userId });
  }

  /**
   * Corrige la promoción y/o las cuotas de una compra con tarjeta. La tasa pasa por resolveRate, igual que al
   * crear. Un gasto de cuenta no tiene ninguna de las dos; la deuda inicial se corrige desde la tarjeta.
   */
  async update(userId: number, id: number, input: UpdateExpenseInput): Promise<Expense> {
    const repo = this.dataSource.getRepository(Expense);
    const expense = await repo.findOneBy({ id, userId });
    if (!expense) throw new NotFoundException(`El gasto ${id} no existe`);
    if (expense.installments === null) {
      throw new BadRequestException('Solo las compras con tarjeta tienen cuotas y promoción');
    }
    if (expense.isOpeningDebt) {
      throw new BadRequestException('Este gasto es la deuda inicial de una tarjeta: se corrige desde la tarjeta');
    }

    // Se resuelve todo antes de escribir: una tasa mala es un 400 y no deja nada a medias
    const changes: Partial<Expense> = {};
    if (input.installments !== undefined) changes.installments = input.installments;
    if (input.promo === null) {
      changes.promoEa = null;
      changes.promoMv = null;
      changes.promoDescription = '';
    } else if (input.promo !== undefined) {
      const rate = resolveRate({ ea: input.promo.ea, mv: input.promo.mv });
      changes.promoEa = rate.ea;
      changes.promoMv = rate.mv;
      changes.promoDescription = input.promo.description ?? '';
    }
    return repo.save({ ...expense, ...changes });
  }

  /**
   * Origen     Cuotas        Promoción    Deuda inicial
   * Cuenta     prohibidas    prohibida    prohibida
   * Tarjeta    obligatorias  permitida    permitida
   * Préstamo   el gasto entero es inválido
   */
  private assertRulesFor(product: Product, input: CreateExpenseInput): void {
    if (product.kind === 'loan') {
      throw new BadRequestException(`El producto ${product.id} es un préstamo: no se puede gastar desde un préstamo`);
    }

    if (product.kind === 'credit_card') {
      if (input.installments === undefined) {
        throw new BadRequestException('Un gasto con tarjeta necesita el número de cuotas');
      }
      return;
    }

    // Cuenta
    if (input.installments !== undefined) {
      throw new BadRequestException('Un gasto desde una cuenta no lleva cuotas: solo las tarjetas difieren a cuotas');
    }
    if (input.promo !== undefined) {
      throw new BadRequestException('Un gasto desde una cuenta no admite promoción: solo aplica a tarjetas');
    }
    if (input.isOpeningDebt) {
      throw new BadRequestException('Un gasto desde una cuenta no puede ser deuda inicial: solo aplica a tarjetas');
    }
  }
}
