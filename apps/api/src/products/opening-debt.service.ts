import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cents } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { expenseValues } from '../movements/expenses.service';
import { CreditCard } from './entities/credit-card.entity';
import { openingDebtDate } from './opening-debt-date';
import { Product } from './entities/product.entity';
import { assertCardProduct } from './product-checks';
import type { RateInput } from './resolve-rate';

/** Un grupo de la deuda que la tarjeta ya traía: compras con las mismas cuotas restantes, sumadas. */
export interface OpeningDebtItemInput {
  amountCents: Cents;
  installments: number;
  /** Tasa propia del grupo (p. ej. 0 %); sin ella paga la de la tarjeta. */
  promo?: RateInput & { description?: string };
}

export interface OpeningDebtInput {
  items: OpeningDebtItemInput[];
  /** Si ya pagaste el extracto del último corte (con pago pendiente); entonces no cuenta como "próximo pago". */
  statementPaid?: boolean;
}

/** Un grupo ya guardado, con la tasa de su promoción como texto (son decimales exactos). */
export interface OpeningDebtGroup {
  id: number;
  amountCents: Cents;
  installments: number;
  promo: { ea: string; mv: string; description: string } | null;
}

/**
 * La deuda que una tarjeta ya traía al empezar a usar la app. Una tarjeta real es la suma de muchas compras,
 * cada una con sus cuotas restantes; como las que tienen las mismas cuotas y la misma tasa se pueden sumar sin
 * cambiar el resultado, se registra un `expense` con `isOpeningDebt` por grupo. El motor ya sabe planear
 * muchas compras por tarjeta: aquí no hay cálculos.
 */
@Injectable()
export class OpeningDebtService {
  constructor(private readonly dataSource: DataSource) {}

  /** Los grupos actuales, en el orden en que se guardaron. */
  async list(cardId: number): Promise<OpeningDebtGroup[]> {
    assertCardProduct(await this.dataSource.getRepository(Product).findOneBy({ id: cardId }), cardId);
    const rows = await this.dataSource
      .getRepository(Expense)
      .find({ where: { sourceProductId: cardId, isOpeningDebt: true }, order: { id: 'ASC' } });

    return rows.map((e) => ({
      id: e.id,
      amountCents: e.amountCents,
      installments: e.installments ?? 1,
      promo:
        e.promoEa && e.promoMv
          ? { ea: e.promoEa.toFixed(), mv: e.promoMv.toFixed(), description: e.promoDescription }
          : null,
    }));
  }

  /**
   * Reemplaza la deuda inicial de la tarjeta (así se puede corregir): borra los grupos anteriores y crea los
   * nuevos, todo o nada. Si un abono a capital apunta a uno de los anteriores no se puede borrar: 409.
   */
  async replace(cardId: number, input: OpeningDebtInput, today = isoDateOf()): Promise<{ ids: number[] }> {
    return this.dataSource.transaction(async (manager) => {
      assertCardProduct(await manager.findOneBy(Product, { id: cardId }), cardId);
      const card = await manager.findOneBy(CreditCard, { productId: cardId });
      if (!card) throw new NotFoundException(`La tarjeta ${cardId} no tiene datos de tarjeta`);

      // Cada grupo son "las cuotas que faltan, contando la del próximo pago". Si el extracto del último corte
      // aún no vence (y no lo has pagado), la deuda se guarda con la fecha de ese corte para que caiga en él.
      const date = openingDebtDate(today, card.cutDay, card.dueDay, input.statementPaid ?? false);
      // Las filas se arman antes de borrar nada: una tasa mala es un 400 y la transacción no cambia nada
      const rows = input.items.map((item) =>
        expenseValues({
          date,
          amountCents: item.amountCents,
          sourceProductId: cardId,
          installments: item.installments,
          ...(item.promo !== undefined && { promo: item.promo }),
          isOpeningDebt: true,
        }),
      );

      const previous = await manager.find(Expense, { where: { sourceProductId: cardId, isOpeningDebt: true } });
      if (previous.length > 0) {
        const ids = new Set(previous.map((e) => e.id));
        const payments = await manager.find(CapitalPayment, { where: { productId: cardId } });
        if (payments.some((p) => p.expenseId !== null && ids.has(p.expenseId))) {
          throw new ConflictException(
            'No se puede reemplazar la deuda inicial: hay abonos a capital hechos a esas compras. ' +
              'Quita los abonos primero o agrega la corrección como un gasto nuevo.',
          );
        }
        for (const { id } of previous) await manager.delete(Expense, { id });
      }

      const created: number[] = [];
      for (const row of rows) created.push((await manager.save(Expense, row)).id);
      return { ids: created };
    });
  }
}
