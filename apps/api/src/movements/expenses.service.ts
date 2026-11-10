import { BadRequestException, Injectable } from '@nestjs/common';
import type { Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { type RateInput, resolveRate } from '../products/resolve-rate';
import { Category } from './entities/category.entity';
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

@Injectable()
export class ExpensesService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Guarda un gasto. Las reglas que cruzan tablas (dependen del tipo del producto de origen)
   * se validan todas antes de escribir: un rechazo no deja nada guardado. Se escribe una sola
   * tabla, así que no hace falta transacción.
   */
  async create(input: CreateExpenseInput): Promise<Expense> {
    const product = await this.dataSource.getRepository(Product).findOneBy({ id: input.sourceProductId });
    if (!product) throw new BadRequestException(`El producto ${input.sourceProductId} no existe`);
    if (!product.active) {
      throw new BadRequestException(`El producto ${product.id} está desactivado: no admite gastos nuevos`);
    }

    this.assertRulesFor(product, input);
    if (input.categoryId !== undefined) await this.assertExpenseCategory(input.categoryId);

    // La promoción reutiliza resolveRate: una tasa no se valida en dos lugares distintos
    const promo = input.promo ? resolveRate({ ea: input.promo.ea, mv: input.promo.mv }) : undefined;

    return this.dataSource.getRepository(Expense).save({
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
    });
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

  private async assertExpenseCategory(categoryId: number): Promise<void> {
    const category = await this.dataSource.getRepository(Category).findOneBy({ id: categoryId });
    if (!category) throw new BadRequestException(`La categoría ${categoryId} no existe`);
    if (category.kind !== 'expense') {
      throw new BadRequestException(`La categoría ${categoryId} es de ingreso: un gasto necesita una categoría de gasto`);
    }
  }
}
