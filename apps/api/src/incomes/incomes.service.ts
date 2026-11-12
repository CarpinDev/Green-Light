import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cents, IsoDate } from '@greenlight/engine';
import { DataSource } from 'typeorm';
import { definedOnly } from '../common/defined-only';
import { assertDateRange, dayBefore, isoDateOf } from '../common/dates';
import { assertCategoryOfKind } from '../movements/category-check';
import { Product } from '../products/entities/product.entity';
import { assertAccountExists, assertActiveCard } from '../products/product-checks';
import { FixedExpense } from './entities/fixed-expense.entity';
import { OneOffIncome } from './entities/one-off-income.entity';
import { RecurringIncome } from './entities/recurring-income.entity';

export interface CreateRecurringIncomeInput {
  name: string;
  amountCents: Cents;
  /** 1..31; si el mes es más corto se usa el último día. */
  dayOfMonth: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  destinationAccountId?: number;
}

export interface CreateOneOffIncomeInput {
  date: IsoDate;
  amountCents: Cents;
  description?: string;
  /** Debe ser una categoría de ingreso (la regla inversa de la de gastos). */
  categoryId?: number;
  destinationAccountId?: number;
}

export interface CreateFixedExpenseInput {
  name: string;
  amountCents: Cents;
  dayOfMonth: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  /** Debe ser una categoría de gasto. */
  categoryId?: number;
  /** Si se paga con tarjeta: tiene que ser una tarjeta activa. Es una compra a 1 cuota cada mes. */
  cardId?: number;
  /** Si sale de una cuenta: tiene que existir. No se combina con `cardId`. */
  accountId?: number;
}

/**
 * Lo que se puede editar de un ingreso recurrente. No incluye el monto ni el inicio: cambiarlos
 * reescribiría la proyección de los meses pasados (para el monto está `changeAmount`).
 * No hay forma de quitar el endDate: un registro terminado no se reactiva (se superpondría con el que lo
 * reemplazó y la proyección contaría dos veces); para retomarlo se crea uno nuevo. `null` en la cuenta, la tarjeta o la categoría las quita.
 */
export interface UpdateRecurringIncomeInput {
  name?: string;
  dayOfMonth?: number;
  endDate?: IsoDate;
  destinationAccountId?: number | null;
}

export interface UpdateFixedExpenseInput {
  name?: string;
  dayOfMonth?: number;
  endDate?: IsoDate;
  categoryId?: number | null;
  cardId?: number | null;
  accountId?: number | null;
}

/** El monto nuevo rige desde `effectiveFrom`; lo anterior queda como estaba. */
export interface AmountChangeInput {
  amountCents: Cents;
  effectiveFrom: IsoDate;
}

/** Dónde está un registro respecto de hoy: todavía no empieza, rige, o ya terminó. */
export type MonthlyStatus = 'upcoming' | 'active' | 'ended';

/** `status` filtra por estado; sin él, todos. */
export interface ListFilter {
  status?: MonthlyStatus;
}

interface RecurringBase {
  id: number;
  name: string;
  amountCents: Cents;
  dayOfMonth: number;
  startDate: IsoDate;
  endDate: IsoDate | null;
  /** El registro que lo reemplazó por un cambio de monto; null si no lo reemplazaron. */
  replacedById: number | null;
  /** Se puede reactivar: tiene fecha de fin y no lo reemplazó un cambio de monto. */
  canReactivate: boolean;
  /** upcoming: empieza después de hoy; active: rige hoy (el fin, si hay, es hoy o después); ended: ya terminó. */
  status: MonthlyStatus;
}

export interface RecurringIncomeSummary extends RecurringBase {
  destinationAccountId: number | null;
  destinationAccountName: string | null;
}

export interface FixedExpenseSummary extends RecurringBase {
  categoryId: number | null;
  cardId: number | null;
  cardName: string | null;
  accountId: number | null;
  accountName: string | null;
}

/** Lo que tienen en común los dos recursos que se repiten cada mes. */
type MonthlyEntity = RecurringIncome | FixedExpense;
type MonthlyClass = new () => MonthlyEntity;

/**
 * Ingresos y gastos que se repiten o son puntuales. Las reglas se validan antes de escribir,
 * con un 400 claro, sin esperar al CHECK ni a la FK de Postgres.
 */
@Injectable()
export class IncomesService {
  constructor(private readonly dataSource: DataSource) {}

  async createRecurringIncome(input: CreateRecurringIncomeInput): Promise<RecurringIncome> {
    assertDateRange(input.startDate, input.endDate);
    if (input.destinationAccountId !== undefined)
      await assertAccountExists(this.dataSource, input.destinationAccountId);

    return this.dataSource.getRepository(RecurringIncome).save({
      name: input.name,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.destinationAccountId !== undefined && { destinationAccountId: input.destinationAccountId }),
    });
  }

  async createOneOffIncome(input: CreateOneOffIncomeInput): Promise<OneOffIncome> {
    if (input.categoryId !== undefined) await assertCategoryOfKind(this.dataSource, input.categoryId, 'income');
    if (input.destinationAccountId !== undefined)
      await assertAccountExists(this.dataSource, input.destinationAccountId);

    return this.dataSource.getRepository(OneOffIncome).save({
      date: input.date,
      amountCents: input.amountCents,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.destinationAccountId !== undefined && { destinationAccountId: input.destinationAccountId }),
    });
  }

  async createFixedExpense(input: CreateFixedExpenseInput): Promise<FixedExpense> {
    assertDateRange(input.startDate, input.endDate);
    if (input.categoryId !== undefined) await assertCategoryOfKind(this.dataSource, input.categoryId, 'expense');
    if (input.cardId !== undefined) await assertActiveCard(this.dataSource, input.cardId);
    if (input.accountId !== undefined) await assertAccountExists(this.dataSource, input.accountId);
    assertOneSource(input.cardId, input.accountId);

    return this.dataSource.getRepository(FixedExpense).save({
      name: input.name,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.cardId !== undefined && { cardId: input.cardId }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
    });
  }

  /** Todos los ingresos recurrentes, por día del mes y nombre, con el nombre de su cuenta destino. */
  async listRecurringIncomes(filter: ListFilter = {}, today: IsoDate = isoDateOf()): Promise<RecurringIncomeSummary[]> {
    const rows = await this.dataSource
      .getRepository(RecurringIncome)
      .find({ order: { dayOfMonth: 'ASC', name: 'ASC' } });
    const names = await this.productNames();

    return rows
      .map((r) => ({
        ...baseOf(r, today),
        destinationAccountId: r.destinationAccountId ?? null,
        destinationAccountName: names.get(r.destinationAccountId ?? -1) ?? null,
      }))
      .filter((r) => matches(filter, r.status));
  }

  /** Todos los gastos fijos, por día del mes y nombre, con el nombre de su tarjeta. */
  async listFixedExpenses(filter: ListFilter = {}, today: IsoDate = isoDateOf()): Promise<FixedExpenseSummary[]> {
    const rows = await this.dataSource.getRepository(FixedExpense).find({ order: { dayOfMonth: 'ASC', name: 'ASC' } });
    const names = await this.productNames();

    return rows
      .map((r) => ({
        ...baseOf(r, today),
        categoryId: r.categoryId ?? null,
        cardId: r.cardId ?? null,
        cardName: names.get(r.cardId ?? -1) ?? null,
        accountId: r.accountId ?? null,
        accountName: names.get(r.accountId ?? -1) ?? null,
      }))
      .filter((r) => matches(filter, r.status));
  }

  /** Edita solo lo que llega. Las reglas del create se revisan contra el inicio que ya está guardado. */
  async updateRecurringIncome(id: number, input: UpdateRecurringIncomeInput): Promise<{ id: number }> {
    const repository = this.dataSource.getRepository(RecurringIncome);
    const current = await repository.findOneBy({ id });
    if (!current) throw notFound('El ingreso recurrente', id);

    if (input.endDate !== undefined) assertDateRange(current.startDate, input.endDate);
    if (typeof input.destinationAccountId === 'number')
      await assertAccountExists(this.dataSource, input.destinationAccountId);

    await repository.save({ ...current, ...definedOnly(input) });
    return { id };
  }

  async updateFixedExpense(id: number, input: UpdateFixedExpenseInput): Promise<{ id: number }> {
    const repository = this.dataSource.getRepository(FixedExpense);
    const current = await repository.findOneBy({ id });
    if (!current) throw notFound('El gasto fijo', id);

    if (input.endDate !== undefined) assertDateRange(current.startDate, input.endDate);
    if (typeof input.categoryId === 'number') await assertCategoryOfKind(this.dataSource, input.categoryId, 'expense');
    if (typeof input.cardId === 'number') await assertActiveCard(this.dataSource, input.cardId);
    if (typeof input.accountId === 'number') await assertAccountExists(this.dataSource, input.accountId);

    // Se valida lo que quedaría guardado, no solo lo que llega: pasar de tarjeta a cuenta llega como
    // { cardId: null, accountId }, y mandar solo accountId no debe dejar las dos
    const changes = definedOnly(input);
    const result = { ...current, ...changes };
    assertOneSource(result.cardId, result.accountId);

    await repository.save(result);
    return { id };
  }

  /** Cambia el monto desde una fecha sin tocar los meses anteriores. Devuelve el id del registro nuevo. */
  changeRecurringIncomeAmount(id: number, input: AmountChangeInput): Promise<{ id: number }> {
    return this.changeAmount(RecurringIncome, 'El ingreso recurrente', id, input);
  }

  changeFixedExpenseAmount(id: number, input: AmountChangeInput): Promise<{ id: number }> {
    return this.changeAmount(FixedExpense, 'El gasto fijo', id, input);
  }

  /** Quita el fin de un ingreso recurrente terminado. 409 si lo reemplazó un cambio de monto. */
  async reactivateRecurringIncome(id: number): Promise<RecurringIncomeSummary> {
    await this.reactivate(RecurringIncome, 'El ingreso recurrente', id);
    return this.summaryOf(await this.listRecurringIncomes(), id, 'El ingreso recurrente');
  }

  /** Quita el fin de un gasto fijo terminado. 409 si lo reemplazó un cambio de monto. */
  async reactivateFixedExpense(id: number): Promise<FixedExpenseSummary> {
    await this.reactivate(FixedExpense, 'El gasto fijo', id);
    return this.summaryOf(await this.listFixedExpenses(), id, 'El gasto fijo');
  }

  /**
   * Un terminado a mano se reactiva quitándole el fin; uno reemplazado por un cambio de monto no (se superpondría
   * con su sucesor). Sin fin ya no hay nada que hacer: devuelve lo mismo (idempotente).
   */
  private async reactivate(Entity: MonthlyClass, label: string, id: number): Promise<void> {
    const repository = this.dataSource.getRepository(Entity);
    const current = await repository.findOneBy({ id });
    if (!current) throw notFound(label, id);
    if ((current.replacedById ?? null) !== null) throw new ConflictException(REPLACED_MESSAGE);
    if ((current.endDate ?? null) === null) return;

    await repository.save({ ...current, endDate: null });
  }

  private summaryOf<T extends { id: number }>(list: readonly T[], id: number, label: string): T {
    const found = list.find((r) => r.id === id);
    if (!found) throw notFound(label, id);
    return found;
  }

  /** Borrado real, para lo que se creó por error: no deja historia. Para terminar uno, se le pone endDate. */
  async removeRecurringIncome(id: number): Promise<void> {
    const { affected } = await this.dataSource.getRepository(RecurringIncome).delete({ id });
    if (!affected) throw notFound('El ingreso recurrente', id);
  }

  async removeFixedExpense(id: number): Promise<void> {
    const { affected } = await this.dataSource.getRepository(FixedExpense).delete({ id });
    if (!affected) throw notFound('El gasto fijo', id);
  }

  /**
   * El historial no se reescribe: el registro actual termina el día antes de `effectiveFrom` y uno
   * nuevo, con el monto nuevo, empieza ese día. Los dos pasos van juntos o ninguno.
   */
  private changeAmount(
    Entity: MonthlyClass,
    label: string,
    id: number,
    input: AmountChangeInput,
  ): Promise<{ id: number }> {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.findOneBy<MonthlyEntity>(Entity, { id });
      if (!current) throw notFound(label, id);

      if (input.effectiveFrom <= current.startDate) {
        throw new BadRequestException(
          `El cambio debe empezar después del inicio (${current.startDate}); para corregir el monto de un registro nuevo, bórralo y créalo de nuevo`,
        );
      }
      if (current.endDate !== null && current.endDate !== undefined && current.endDate < input.effectiveFrom) {
        throw new BadRequestException(
          `Ya terminó el ${current.endDate}, antes del ${input.effectiveFrom}: no hay un monto vigente que cambiar`,
        );
      }

      // Uno ya reemplazado no se vuelve a cambiar: el vigente es su sucesor
      if ((current.replacedById ?? null) !== null) throw new ConflictException(REPLACED_MESSAGE);

      const originalEnd = current.endDate ?? null;
      // Una copia sin id (ni marca de reemplazo): guardarla crea una fila nueva en vez de actualizar la actual
      const copy = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== 'id' && key !== 'replacedById'),
      );
      const created = await manager.save(Entity, {
        ...copy,
        endDate: originalEnd,
        amountCents: input.amountCents,
        startDate: input.effectiveFrom,
      });
      // El viejo termina el día anterior y queda marcado como reemplazado: así no se puede reactivar y contar doble
      await manager.save(Entity, { ...current, endDate: dayBefore(input.effectiveFrom), replacedById: created.id });
      return { id: created.id };
    });
  }

  /** Los nombres de los productos por id: con pocos productos basta traerlos todos. */
  private async productNames(): Promise<Map<number, string>> {
    const products = await this.dataSource.getRepository(Product).find();
    return new Map(products.map((p) => [p.id, p.name]));
  }
}

/** Un gasto fijo sale de una tarjeta o de una cuenta, no de las dos. */
function assertOneSource(cardId: number | null | undefined, accountId: number | null | undefined): void {
  if (cardId != null && accountId != null) {
    throw new BadRequestException('Un gasto fijo sale de una tarjeta o de una cuenta, no de las dos');
  }
}

const REPLACED_MESSAGE = 'Este registro se reemplazó por un cambio de monto; edita el vigente';

function notFound(label: string, id: number): NotFoundException {
  return new NotFoundException(`${label} ${id} no existe`);
}

function baseOf(r: MonthlyEntity, today: IsoDate): RecurringBase {
  const endDate = r.endDate ?? null;
  return {
    id: r.id,
    name: r.name,
    amountCents: r.amountCents,
    dayOfMonth: r.dayOfMonth,
    startDate: r.startDate,
    endDate,
    replacedById: r.replacedById ?? null,
    canReactivate: endDate !== null && (r.replacedById ?? null) === null,
    status: statusOf(r.startDate, endDate, today),
  };
}

/** El fin cuenta hasta el final de ese día; el inicio, desde el principio del suyo. */
export function statusOf(startDate: IsoDate, endDate: IsoDate | null, today: IsoDate): MonthlyStatus {
  if (endDate !== null && endDate < today) return 'ended';
  return startDate > today ? 'upcoming' : 'active';
}

function matches(filter: ListFilter, status: MonthlyStatus): boolean {
  return filter.status === undefined || filter.status === status;
}
