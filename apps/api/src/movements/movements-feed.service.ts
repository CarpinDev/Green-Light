import { Injectable } from '@nestjs/common';
import { type Cents, type IsoDate, monthlyDates } from '@greenlight/engine';
import { DataSource, IsNull, LessThanOrEqual } from 'typeorm';
import { addDays, isoDateOf } from '../common/dates';
import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { DebtPayment } from '../payments/entities/debt-payment.entity';
import { RecurringConfirmation } from '../payments/entities/recurring-confirmation.entity';
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
  type: 'expense' | 'income' | 'capital_payment' | 'debt_payment';
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
  /** Una ocurrencia de lo programado (salario, gasto fijo) que todavía no se confirma: se calcula, no se registra. */
  scheduled: boolean;
  /** Solo en lo programado sin confirmar: la fecha esperada que la app manda para confirmarlo. */
  scheduledDate: IsoDate | null;
  /** Solo en lo programado sin confirmar: el id del ingreso o gasto fijo, y de cuál de los dos es. */
  refId: number | null;
  refKind: 'recurring_income' | 'fixed_expense' | null;
  /** En lo programado ya confirmado: el id de la confirmación, para deshacerla. */
  confirmationId: number | null;
  /** En el pago de una tarjeta o préstamo confirmado: su id, para deshacerlo. */
  debtPaymentId: number | null;
}

/** Los campos de confirmación en lo que no es programado ni confirmado. */
const NOT_CONFIRMABLE = {
  scheduledDate: null,
  refId: null,
  refKind: null,
  confirmationId: null,
  debtPaymentId: null,
} as const;

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
    // Lo confirmado también es "recién pasado", con su fecha real (no la programada)
    const confirmedRecent = (dateColumn: 'paidDate' | 'actualDate') => ({
      where: { userId, [dateColumn]: LessThanOrEqual(today) },
      order: { [dateColumn]: 'DESC', createdAt: 'DESC', id: 'DESC' } as const,
      take: limit,
    });
    const [expenses, incomes, capital, debtPayments, confirmations, recurring, fixed, products, categories] =
      await Promise.all([
        this.dataSource.getRepository(Expense).find({ ...recent, take: limit }),
        this.dataSource.getRepository(OneOffIncome).find({ ...recent, take: limit }),
        // El excedente de un pago no sale aparte: se muestra dentro del pago
        this.dataSource
          .getRepository(CapitalPayment)
          .find({ ...recent, where: { ...recent.where, debtPaymentId: IsNull() }, take: limit }),
        this.dataSource.getRepository(DebtPayment).find(confirmedRecent('paidDate')),
        this.dataSource.getRepository(RecurringConfirmation).find(confirmedRecent('actualDate')),
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
    const sourceLabelOf = (c: { isExternal: boolean; sourceAccountId: number | null }): string | null => {
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
          ...NOT_CONFIRMABLE,
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
          ...NOT_CONFIRMABLE,
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
          ...NOT_CONFIRMABLE,
        },
      })),
      // Un pago confirmado de tarjeta o préstamo: lo pagado en total, con la fecha real y de dónde salió
      ...debtPayments.map((d) => {
        const product = productOf(d.productId);
        return {
          registeredAt: d.createdAt.getTime(),
          item: {
            id: `debt:${d.id}`,
            type: 'debt_payment' as const,
            direction: 'out' as const,
            date: d.paidDate,
            amountCents: d.amountCents,
            description: product === null ? 'Pago' : `Pago ${product.name} ••${product.last4}`,
            categoryName: null,
            product,
            installments: null,
            isOpeningDebt: false,
            sourceLabel: sourceLabelOf(d),
            scheduled: false,
            ...NOT_CONFIRMABLE,
            debtPaymentId: d.id,
          },
        };
      }),
    ];

    // Lo programado que ya se confirmó sale con su fecha y monto reales, no como calculado. Se busca por la fecha
    // esperada (la clave), que no cambia aunque llegara otro día.
    const confirmedKey = (kind: 'recurring_income' | 'fixed_expense', id: number, date: IsoDate) =>
      `${kind}:${id}:${date}`;
    const confirmedKeys = new Set(
      confirmations.map((c) =>
        c.recurringIncomeId !== null
          ? confirmedKey('recurring_income', c.recurringIncomeId, c.scheduledDate)
          : confirmedKey('fixed_expense', c.fixedExpenseId ?? 0, c.scheduledDate),
      ),
    );

    // Lo programado no se registra: se calcula con monthlyDates, el mismo que usa la proyección, para que
    // el día 31 de un mes corto caiga igual en las dos pantallas. Sin hora de registro: en un empate de
    // fecha va después de lo registrado.
    const from = addDays(today, -SCHEDULED_LOOKBACK_DAYS);
    for (const r of recurring) {
      for (const date of monthlyDates(r.dayOfMonth, r.startDate, r.endDate ?? undefined, from, today)) {
        if (confirmedKeys.has(confirmedKey('recurring_income', r.id, date))) continue; // sale abajo, con lo real
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
            ...NOT_CONFIRMABLE,
            scheduledDate: date,
            refId: r.id,
            refKind: 'recurring_income' as const,
          },
        });
      }
    }
    for (const f of fixed) {
      for (const date of monthlyDates(f.dayOfMonth, f.startDate, f.endDate ?? undefined, from, today)) {
        if (confirmedKeys.has(confirmedKey('fixed_expense', f.id, date))) continue;
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
            ...NOT_CONFIRMABLE,
            scheduledDate: date,
            // Con tarjeta no se confirma: se paga en el extracto
            refId: f.cardId === null ? f.id : null,
            refKind: f.cardId === null ? ('fixed_expense' as const) : null,
          },
        });
      }
    }
    for (const c of confirmations) {
      const r = c.recurringIncomeId === null ? undefined : recurring.find((x) => x.id === c.recurringIncomeId);
      const f = c.fixedExpenseId === null ? undefined : fixed.find((x) => x.id === c.fixedExpenseId);
      if (r === undefined && f === undefined) continue;
      ranked.push({
        registeredAt: c.createdAt.getTime(),
        item: {
          id: r !== undefined ? `recurring:${r.id}:${c.scheduledDate}` : `fixed:${f?.id}:${c.scheduledDate}`,
          type: r !== undefined ? 'income' : 'expense',
          direction: r !== undefined ? 'in' : 'out',
          date: c.actualDate,
          amountCents: c.amountCents,
          description: r?.name ?? f?.name ?? '',
          categoryName: f === undefined ? null : categoryName(f.categoryId),
          product: productOf(c.accountId ?? r?.destinationAccountId ?? f?.accountId ?? null),
          installments: null,
          isOpeningDebt: false,
          sourceLabel: null,
          scheduled: false,
          ...NOT_CONFIRMABLE,
          confirmationId: c.id,
        },
      });
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
