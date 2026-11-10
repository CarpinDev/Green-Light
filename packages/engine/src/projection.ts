import Decimal from 'decimal.js';
import { type IsoDate, endOfMonth, shiftMonths } from './calendar';
import type { Cents } from './money';

export interface RecurringIncome {
  id: string;
  name: string;
  amount: Cents;
  /** Día del mes en que llega (se recorta en los meses cortos). */
  day: number;
  start: IsoDate;
  end?: IsoDate;
}

export interface OneOffIncome {
  id: string;
  date: IsoDate;
  amount: Cents;
  description: string;
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: Cents;
  day: number;
  start: IsoDate;
  end?: IsoDate;
  /** Si se paga con tarjeta, no sale del disponible hasta que se paga el extracto. */
  cardId?: string;
}

export interface CashExpense {
  id: string;
  date: IsoDate;
  amount: Cents;
  description: string;
}

export type CashEventKind = 'income' | 'expense' | 'fixed_expense' | 'loan_payment' | 'card_payment';

/** Movimiento del disponible. El monto lleva signo: + si entra plata, − si sale. */
export interface CashEvent {
  date: IsoDate;
  kind: CashEventKind;
  amount: Cents;
  label: string;
  refId: string;
}

export type TrafficLight = 'green' | 'yellow' | 'red';

export interface ProjectionInput {
  /** Fecha del saldo real: solo cuentan los eventos posteriores. */
  asOf: IsoDate;
  openingBalance: Cents;
  recurringIncomes?: readonly RecurringIncome[];
  oneOffIncomes?: readonly OneOffIncome[];
  fixedExpenses?: readonly FixedExpense[];
  cashExpenses?: readonly CashExpense[];
  /** Eventos de otros módulos (cuotas de préstamos, extractos de tarjeta…), con su signo. */
  extraEvents?: readonly CashEvent[];
  /** Fracción del ingreso del mes por debajo de la cual el cierre es amarillo (0.10 = 10 %). */
  yellowBelowIncomePct: Decimal;
}

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  openingBalance: Cents;
  income: Cents;
  /** Total que sale, en positivo. */
  outflow: Cents;
  closingBalance: Cents;
  /** Menor saldo del mes, contando el inicial. */
  lowestBalance: Cents;
  /** Día del punto más bajo; no hay fecha si el mínimo es el saldo inicial. */
  lowestBalanceDate?: IsoDate;
  /** Todo el ingreso del mes, incluso el que llegó antes de `asOf`. */
  referenceIncome: Cents;
  light: TrafficLight;
  events: CashEvent[];
}

/** Fechas de algo mensual en `day`, vigente entre `start` y `end`, dentro del rango [from, to]. */
export function monthlyDates(
  day: number,
  start: IsoDate,
  end: IsoDate | undefined,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let k = 0; ; k++) {
    const date = shiftMonths(from, k, day);
    if (date > to) break;
    if (date >= from && date >= start && (end === undefined || date <= end)) dates.push(date);
  }
  return dates;
}

/** Por fecha y, el mismo día, primero lo que entra: un saldo negativo de un instante no es real. */
export function sortEvents(events: readonly CashEvent[]): CashEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || Number(b.amount > 0) - Number(a.amount > 0));
}

/** Rojo si cierra en negativo; amarillo si pasó por negativo o cierra bajo `pct` del ingreso del mes. */
export function classify(
  closing: Cents,
  lowest: Cents,
  referenceIncome: Cents,
  pct: Decimal,
): TrafficLight {
  if (closing < 0) return 'red';
  if (lowest < 0 || new Decimal(closing).lt(new Decimal(referenceIncome).times(pct))) return 'yellow';
  return 'green';
}

export function project(input: ProjectionInput, months = 3): MonthSummary[] {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError(`months debe ser un entero >= 1, llegó ${months}`);
  }

  const firstMonth = shiftMonths(input.asOf, 0, 1);
  const to = endOfMonth(shiftMonths(firstMonth, months - 1, 1));
  return summarizeMonths(input, buildEvents(input, firstMonth, to), months);
}

/** Todos los eventos del rango [from, to], incluso los anteriores a `asOf` (sirven para el ingreso de referencia). */
function buildEvents(input: ProjectionInput, from: IsoDate, to: IsoDate): CashEvent[] {
  const inRange = (date: IsoDate): boolean => date >= from && date <= to;
  const events: CashEvent[] = [];

  for (const inc of input.recurringIncomes ?? []) {
    for (const date of monthlyDates(inc.day, inc.start, inc.end, from, to)) {
      events.push({ date, kind: 'income', amount: inc.amount, label: inc.name, refId: inc.id });
    }
  }
  for (const inc of input.oneOffIncomes ?? []) {
    if (inRange(inc.date)) {
      events.push({ date: inc.date, kind: 'income', amount: inc.amount, label: inc.description, refId: inc.id });
    }
  }
  for (const exp of input.fixedExpenses ?? []) {
    // Con tarjeta afecta el disponible cuando se paga el extracto, no aquí
    if (exp.cardId !== undefined) continue;
    for (const date of monthlyDates(exp.day, exp.start, exp.end, from, to)) {
      events.push({ date, kind: 'fixed_expense', amount: -exp.amount, label: exp.name, refId: exp.id });
    }
  }
  for (const exp of input.cashExpenses ?? []) {
    if (inRange(exp.date)) {
      events.push({ date: exp.date, kind: 'expense', amount: -exp.amount, label: exp.description, refId: exp.id });
    }
  }
  for (const ev of input.extraEvents ?? []) {
    if (inRange(ev.date)) events.push(ev);
  }

  return events;
}

function summarizeMonths(input: ProjectionInput, all: readonly CashEvent[], months: number): MonthSummary[] {
  const summaries: MonthSummary[] = [];
  const firstMonth = shiftMonths(input.asOf, 0, 1);
  let balance = input.openingBalance;

  for (let k = 0; k < months; k++) {
    const month = shiftMonths(firstMonth, k, 1).slice(0, 7);
    const ofMonth = all.filter((e) => e.date.startsWith(month));
    const referenceIncome = sumBy(ofMonth.filter((e) => e.kind === 'income'), (e) => e.amount);
    // Lo anterior a asOf ya está dentro del saldo
    const events = sortEvents(ofMonth.filter((e) => e.date > input.asOf));

    const openingBalance = balance;
    let lowestBalance = openingBalance;
    let lowestBalanceDate: IsoDate | undefined;
    for (const e of events) {
      balance += e.amount;
      if (balance < lowestBalance) {
        lowestBalance = balance;
        lowestBalanceDate = e.date;
      }
    }

    summaries.push({
      month,
      openingBalance,
      income: sumBy(events.filter((e) => e.amount > 0), (e) => e.amount),
      outflow: -sumBy(events.filter((e) => e.amount < 0), (e) => e.amount),
      closingBalance: balance,
      lowestBalance,
      ...(lowestBalanceDate !== undefined && { lowestBalanceDate }),
      referenceIncome,
      light: classify(balance, lowestBalance, referenceIncome, input.yellowBelowIncomePct),
      events,
    });
  }

  return summaries;
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
