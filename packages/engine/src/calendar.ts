interface ParsedDate {
    year: number;
    month: number;
    day: number;
}

/**
 * Valida que un día esté entre 1 y 31.
 */
function assertDayOfMonth(day: number, label: string): void {
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error(`${label} debe estar entre 1 y 31.`);
    }
}

/**
 * Obtiene el último día de un mes.
 * month utiliza formato 1-12.
 */
function lastDayOfMonth(year: number, month: number): number {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month, 0);

    return date.getUTCDate();
}

/**
 * Convierte YYYY-MM-DD en sus componentes y valida la fecha.
 */
function parseDate(value: string): ParsedDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        throw new Error(`Fecha inválida: ${value}. Usa YYYY-MM-DD.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}.`);
    }

    if (day < 1 || day > lastDayOfMonth(year, month)) {
        throw new Error(`Día inválido: ${day}.`);
    }

    return { year, month, day };
}

/**
 * Formatea una fecha como YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");

    return `${year}-${m}-${d}`;
}

/**
 * Limita el día al último día disponible del mes.
 */
export function clampDay(
    year: number,
    month: number,
    day: number
): string {
    assertDayOfMonth(day, "El día");

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}.`);
    }

    const lastDay = lastDayOfMonth(year, month);
    const clampedDay = Math.min(day, lastDay);

    return formatDate(year, month, clampedDay);
}

/**
 * Agrega meses a una fecha conservando el día cuando sea posible.
 * Si el día no existe en el mes destino, lo limita al último día.
 */
export function addMonths(
    year: number,
    month: number,
    months: number,
    day: number
): string {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}.`);
    }

    if (!Number.isInteger(months)) {
        throw new Error("La cantidad de meses debe ser un entero.");
    }

    const totalMonths = year * 12 + (month - 1) + months;

    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1;

    return clampDay(targetYear, targetMonth, day);
}

/**
 * Determina la fecha de corte correspondiente a una compra.
 * Si la compra ocurre el mismo día del corte, entra en ese corte.
 */
export function cutDateFor(
    purchaseDate: string,
    cutDay: number
): string {
    const { year, month, day } = parseDate(purchaseDate);

    assertDayOfMonth(cutDay, "El día de corte");

    if (day <= cutDay) {
        return clampDay(year, month, cutDay);
    }

    return addMonths(year, month, 1, cutDay);
}

/**
 * Calcula la fecha límite de pago de un corte.
 */
export function dueDateFor(
    cutDate: string,
    paymentDay: number
): string {
    const { year, month } = parseDate(cutDate);

    assertDayOfMonth(paymentDay, "El día de pago");

    const candidate = clampDay(year, month, paymentDay);

    return candidate <= cutDate
        ? addMonths(year, month, 1, paymentDay)
        : candidate;
}

/**
 * Calcula el N-ésimo corte posterior a una fecha de corte.
 * Conserva el día configurado incluso cuando algún mes
 * requiere ajustar temporalmente el corte.
 */
export function nthCutAfter(
    cutDate: string,
    cutDay: number,
    n: number
): string {
    const { year, month } = parseDate(cutDate);

    assertDayOfMonth(cutDay, "El día de corte");

    if (!Number.isInteger(n) || n < 0) {
        throw new Error("La cantidad de cortes debe ser un entero no negativo.");
    }

    return addMonths(year, month, n, cutDay);
}

/** Fecha en formato YYYY-MM-DD. */
export type IsoDate = string;

/** Día del mes (1..31) de una fecha YYYY-MM-DD. */
export function dayOfMonth(date: IsoDate): number {
    return parseDate(date).day;
}

/** Días entre dos fechas (to − from); negativo si `to` es anterior. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
    const a = parseDate(from);
    const b = parseDate(to);
    const msPerDay = 86_400_000;

    return Math.round(
        (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / msPerDay,
    );
}


/**
 * Mueve una fecha `months` meses (también negativos) usando el día indicado.
 * Si el día no existe en el mes destino, usa el último.
 */
export function shiftMonths(date: IsoDate, months: number, day: number): IsoDate {
    const { year, month } = parseDate(date);

    assertDayOfMonth(day, "El día");

    return addMonths(year, month, months, day);
}
