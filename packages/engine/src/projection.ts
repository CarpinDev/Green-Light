import Decimal from 'decimal.js';
import { type IsoDate, endOfMonth, shiftMonths } from './calendar';
import type { Cents } from './money';
import { sumBy } from './collections';

/**
 * Un pago esperado que ya pasó de verdad. Reemplaza al supuesto (misma clave `scheduledDate`), no se suma a él:
 * el evento sale en la fecha y por el monto reales.
 */
export interface ConfirmedPayment {
  /** Clave del pago esperado: cutDate (tarjeta), dueDate (préstamo) o fecha esperada (recurrente). No cambia al pagar otro día. */
  scheduledDate: IsoDate;
  /** Día real. */
  date: IsoDate;
  /** Lo que cuenta como este pago (en tarjetas/préstamos: pagado − excedente, que llega como abono aparte). */
  amount: Cents;
  /** Pagado con plata externa: baja la deuda pero no sale del disponible. */
  external?: boolean;
  /** Registrado después del saldo confirmado (solo importa si `date === asOf`); lo calcula quien arma la entrada. */
  afterBalance?: boolean;
}

export interface RecurringIncome {
  id: string;
  name: string;
  amount: Cents;
  /** Día del mes en que llega (se recorta en los meses cortos). */
  day: number;
  start: IsoDate;
  end?: IsoDate;
  /** Llegadas ya confirmadas (por su fecha esperada). */
  confirmed?: readonly ConfirmedPayment[];
}

export interface OneOffIncome {
  id: string;
  date: IsoDate;
  amount: Cents;
  description: string;
  /**
   * Registrado después del saldo confirmado que fija `asOf`. Solo importa si `date === asOf`: ese día
   * cuenta únicamente lo que llegó después del saldo (el resto ya está dentro). El motor no sabe de horas:
   * quien arma la entrada calcula el booleano.
   */
  afterBalance?: boolean;
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
  /** Pagos ya confirmados (por su fecha esperada). Con tarjeta no se confirman: se pagan en el extracto. */
  confirmed?: readonly ConfirmedPayment[];
}

export interface CashExpense {
  id: string;
  date: IsoDate;
  amount: Cents;
  description: string;
  /**
   * Registrado después del saldo confirmado que fija `asOf`. Solo importa si `date === asOf`: ese día
   * cuenta únicamente lo que llegó después del saldo (el resto ya está dentro). El motor no sabe de horas:
   * quien arma la entrada calcula el booleano.
   */
  afterBalance?: boolean;
}

export type CashEventKind =
  | 'income'
  | 'expense'
  | 'fixed_expense'
  | 'loan_payment'
  | 'card_payment'
  | 'capital_payment';

/** Movimiento del disponible. El monto lleva signo: + si entra plata, − si sale. */
export interface CashEvent {
  date: IsoDate;
  kind: CashEventKind;
  amount: Cents;
  label: string;
  refId: string;
  /**
   * Registrado después del saldo confirmado que fija `asOf`. Solo importa si `date === asOf`: ese día
   * cuenta únicamente lo que llegó después del saldo (el resto ya está dentro). El motor no sabe de horas:
   * quien arma la entrada calcula el booleano.
   */
  afterBalance?: boolean;
  /**
   * Solo en `card_payment`: el corte del extracto que se paga (la `date` es su vencimiento). Un campo y no el
   * texto del `label` porque el texto es para mostrar: cambia de redacción y parsearlo rompe en silencio.
   */
  cutDate?: IsoDate;
  /** Solo en `card_payment`: lo que saldaría todo el extracto, en positivo (la `amount` es solo el mínimo). */
  fullPayment?: Cents;
  /**
   * La fecha programada de lo que se puede confirmar (corte de la tarjeta, vencimiento de la cuota, fecha esperada
   * del salario o gasto fijo). Es la clave de la confirmación; no cambia aunque se pague otro día.
   */
  scheduledDate?: IsoDate;
  /** Ya lo confirmó la persona: `date` y `amount` son los reales, no los supuestos. */
  confirmed?: true;
}

export type TrafficLight = 'green' | 'yellow' | 'red';

export interface ProjectionInput {
  /**
   * Fecha del saldo real: cuentan los eventos posteriores y, del mismo día, los marcados `afterBalance`.
   * Los abonos a capital, los ingresos y gastos recurrentes y lo que viene de otros módulos (`extraEvents`)
   * no se desempatan: lo de ese día ya está en el saldo.
   */
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

/**
 * La ocurrencia de un ingreso o gasto fijo en su fecha esperada. Si está confirmada, el evento va en la fecha y por
 * el monto reales (el signo lo da `expected`: + ingreso, − gasto); si no, como estaba programado.
 */
function recurringEvent(
  kind: 'income' | 'fixed_expense',
  scheduledDate: IsoDate,
  expected: Cents,
  label: string,
  refId: string,
  confirmed: ConfirmedPayment | undefined,
): CashEvent {
  if (confirmed === undefined) return { date: scheduledDate, kind, amount: expected, label, refId, scheduledDate };
  return {
    date: confirmed.date,
    kind,
    amount: expected < 0 ? -confirmed.amount : confirmed.amount,
    label,
    refId,
    scheduledDate,
    confirmed: true,
    ...(confirmed.afterBalance === true && { afterBalance: true }),
  };
}

/** Todos los eventos del rango [from, to], incluso los anteriores a `asOf` (sirven para el ingreso de referencia). */
function buildEvents(input: ProjectionInput, from: IsoDate, to: IsoDate): CashEvent[] {
  const inRange = (date: IsoDate): boolean => date >= from && date <= to;
  const events: CashEvent[] = [];

  for (const inc of input.recurringIncomes ?? []) {
    for (const date of monthlyDates(inc.day, inc.start, inc.end, from, to)) {
      const done = inc.confirmed?.find((c) => c.scheduledDate === date);
      events.push(recurringEvent('income', date, inc.amount, inc.name, inc.id, done));
    }
  }
  for (const inc of input.oneOffIncomes ?? []) {
    if (inRange(inc.date)) {
      events.push({
        date: inc.date,
        kind: 'income',
        amount: inc.amount,
        label: inc.description,
        refId: inc.id,
        ...(inc.afterBalance === true && { afterBalance: true }),
      });
    }
  }
  for (const exp of input.fixedExpenses ?? []) {
    // Con tarjeta afecta el disponible cuando se paga el extracto, no aquí
    if (exp.cardId !== undefined) continue;
    for (const date of monthlyDates(exp.day, exp.start, exp.end, from, to)) {
      const done = exp.confirmed?.find((c) => c.scheduledDate === date);
      events.push(recurringEvent('fixed_expense', date, -exp.amount, exp.name, exp.id, done));
    }
  }
  for (const exp of input.cashExpenses ?? []) {
    if (inRange(exp.date)) {
      events.push({
        date: exp.date,
        kind: 'expense',
        amount: -exp.amount,
        label: exp.description,
        refId: exp.id,
        ...(exp.afterBalance === true && { afterBalance: true }),
      });
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
    // Lo anterior a asOf ya está dentro del saldo; el mismo día, solo lo registrado después de confirmarlo
    const events = sortEvents(
      ofMonth.filter((e) => e.date > input.asOf || (e.date === input.asOf && e.afterBalance === true)),
    );

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
