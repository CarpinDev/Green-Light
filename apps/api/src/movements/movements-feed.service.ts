import { Injectable } from '@nestjs/common';
import { type Cents, type IsoDate, monthlyDates } from '@greenlight/engine';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { addDays, isoDateOf } from '../common/dates';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { Product } from '../products/entities/product.entity';
import type { ProductKind } from '../products/product-kind';
import { CapitalPayment } from './entities/capital-payment.entity';
import { Category } from './entities/category.entity';
import { Expense } from './entities/expense.entity';

/** Cuántos días hacia atrás se calculan las ocurrencias de lo programado (salario, gastos fijos). */
export const SCHEDULED_LOOKBACK_DAYS = 60;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface MovementProduct {
  id: number;
  name: string;
  last4: string;
  kind: ProductKind;
}

/** Un movimiento que ya pasó: lo que la app muestra en "Movimientos recientes". */
export interface MovementItem {
  /** 'expense:12', 'income:5', 'capital:3', 'recurring:2:2026-11-01', 'fixed:4:2026-11-05' */
  id: string;
  type: 'expense' | 'income' | 'capital_payment';
  /** El signo: el monto va siempre en positivo. */
  direction: 'in' | 'out';
  date: IsoDate;
  amountCents: Cents;
  /** La del gasto o ingreso, o el nombre del recurrente o fijo; vacía si no la tiene. */
  description: string;
  categoryName: string | null;
  /** De dónde salió o a dónde llegó: la tarjeta o la cuenta. Null si no se sabe. */
  product: MovementProduct | null;
  /** Solo en gastos con tarjeta. */
  installments: number | null;
  isOpeningDebt: boolean;
  /** Solo en abonos a capital: de dónde salió el dinero, "desde Ahorros ••1357" o "externo". */
  sourceLabel: string | null;
  /** Una ocurrencia de lo programado (salario, gasto fijo): nunca se "registra", se calcula. */
  scheduled: boolean;
}

/** Un movimiento con la hora de registro, que solo sirve para ordenar y no sale en la respuesta. */
interface Ranked {
  item: MovementItem;
  registeredAt: number;
}

/**
 * Lo que ya pasó, mezclado y ordenado del más reciente al más viejo: gastos, ingresos puntuales, abonos a
 * capital y las ocurrencias ya vencidas de lo programado. Lo que tiene fecha futura no sale aquí (es de
 * "Próximos"). Solo lee.
 */
@Injectable()
export class MovementsFeedService {
  constructor(private readonly dataSource: DataSource) {}

  async list(userId: number, limit: number = DEFAULT_LIMIT, today: IsoDate = isoDateOf()): Promise<MovementItem[]> {
    // Lo registrado: de cada tabla, solo los `limit` más recientes (ver la nota de abajo)
    const recent = {
      where: { userId, date: LessThanOrEqual(today) },
      order: { date: 'DESC', createdAt: 'DESC', id: 'DESC' },
    } as const;
    const mine = { where: { userId } };
    const [expenses, incomes, capital, recurring, fixed, products, categories] = await Promise.all([
      this.dataSource.getRepository(Expense).find({ ...recent, take: limit }),
      this.dataSource.getRepository(OneOffIncome).find({ ...recent, take: limit }),
      this.dataSource.getRepository(CapitalPayment).find({ ...recent, take: limit }),
      this.dataSource.getRepository(RecurringIncome).find(mine),
      this.dataSource.getRepository(FixedExpense).find(mine),
      // Pocos productos y categorías: se cargan una vez y se cruzan en memoria
      this.dataSource.getRepository(Product).find(mine),
      this.dataSource.getRepository(Category).find(mine),
    ]);

    const productOf = (id: number | null): MovementProduct | null => {
      const p = id === null ? undefined : products.find((x) => x.id === id);
      return p === undefined ? null : { id: p.id, name: p.name, last4: p.last4, kind: p.kind };
    };
    // De dónde salió el dinero de un abono: la cuenta ("desde Ahorros ••1357") o "externo"; los de antes, nada
    const sourceLabelOf = (c: CapitalPayment): string | null => {
      if (c.isExternal) return 'externo';
      const account = c.sourceAccountId === null ? undefined : products.find((x) => x.id === c.sourceAccountId);
      return account === undefined ? null : `desde ${account.name} ••${account.last4}`;
    };
    const categoryName = (id: number | null): string | null => categories.find((c) => c.id === id)?.name ?? null;

    const ranked: Ranked[] = [
      ...expenses.map((e) => ({
        registeredAt: e.createdAt.getTime(),
        item: {
          id: `expense:${e.id}`,
          type: 'expense' as const,
          direction: 'out' as const,
          date: e.date,
          amountCents: e.amountCents,
          description: e.description,
          categoryName: categoryName(e.categoryId),
          product: productOf(e.sourceProductId),
          installments: e.installments,
          isOpeningDebt: e.isOpeningDebt,
          sourceLabel: null,
          scheduled: false,
        },
      })),
      ...incomes.map((i) => ({
        registeredAt: i.createdAt.getTime(),
        item: {
          id: `income:${i.id}`,
          type: 'income' as const,
          direction: 'in' as const,
          date: i.date,
          amountCents: i.amountCents,
          description: i.description,
          categoryName: categoryName(i.categoryId),
          product: productOf(i.destinationAccountId),
          installments: null,
          isOpeningDebt: false,
          sourceLabel: null,
          scheduled: false,
        },
      })),
      ...capital.map((c) => ({
        registeredAt: c.createdAt.getTime(),
        item: {
          id: `capital:${c.id}`,
          type: 'capital_payment' as const,
          direction: 'out' as const,
          date: c.date,
          amountCents: c.amountCents,
          description: '',
          categoryName: null,
          product: productOf(c.productId),
          installments: null,
          isOpeningDebt: false,
          sourceLabel: sourceLabelOf(c),
          scheduled: false,
        },
      })),
    ];

    // Lo programado no se registra: se calcula con monthlyDates, el mismo que usa la proyección, para que
    // el día 31 de un mes corto caiga igual en las dos pantallas. Sin hora de registro: en un empate de
    // fecha va después de lo registrado.
    const from = addDays(today, -SCHEDULED_LOOKBACK_DAYS);
    for (const r of recurring) {
      for (const date of monthlyDates(r.dayOfMonth, r.startDate, r.endDate ?? undefined, from, today)) {
        ranked.push({
          registeredAt: 0,
          item: {
            id: `recurring:${r.id}:${date}`,
            type: 'income',
            direction: 'in',
            date,
            amountCents: r.amountCents,
            description: r.name,
            categoryName: null,
            product: productOf(r.destinationAccountId),
            installments: null,
            isOpeningDebt: false,
            sourceLabel: null,
            scheduled: true,
          },
        });
      }
    }
    for (const f of fixed) {
      for (const date of monthlyDates(f.dayOfMonth, f.startDate, f.endDate ?? undefined, from, today)) {
        ranked.push({
          registeredAt: 0,
          item: {
            id: `fixed:${f.id}:${date}`,
            type: 'expense',
            direction: 'out',
            date,
            amountCents: f.amountCents,
            description: f.name,
            categoryName: categoryName(f.categoryId),
            // El origen es la tarjeta o la cuenta; sin ninguna sale del saldo en general y no hay producto que mostrar
            product: productOf(f.cardId ?? f.accountId),
            installments: null,
            isOpeningDebt: false,
            sourceLabel: null,
            scheduled: true,
          },
        });
      }
    }

    // Por qué basta con `take: limit` en cada tabla: cualquier elemento que esté entre los `limit` primeros
    // de la mezcla tiene menos de `limit` elementos delante de él en su propia tabla (los que van delante
    // en su tabla también van delante en la mezcla, porque las dos usan el mismo orden: fecha, hora de
    // registro, id). Entonces está dentro de los `limit` primeros de su tabla y no se pierde. Lo programado
    // no es una tabla: sus ocurrencias son pocas (a lo sumo unas por salario o gasto fijo en 60 días) y
    // entran todas a la mezcla.

    // Más reciente primero: fecha, luego hora de registro, y el id como último desempate para que el
    // orden sea siempre el mismo
    ranked.sort(
      (a, b) =>
        b.item.date.localeCompare(a.item.date) ||
        b.registeredAt - a.registeredAt ||
        b.item.id.localeCompare(a.item.id, 'en', { numeric: true }),
    );
    return ranked.slice(0, limit).map((r) => r.item);
  }
}
