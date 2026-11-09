/**
 * Representa una fecha descompuesta.
 */
interface ParsedDate {
    year: number;
    month: number;
    day: number;
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

    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

    if (day < 1 || day > lastDay) {
        throw new Error(`Día inválido: ${day}.`);
    }

    return { year, month, day };
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
    const totalMonths = year * 12 + (month - 1) + months;

    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1;

    return clampDay(targetYear, targetMonth, day);
}

/**
 * Formatea una fecha como YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Obtiene el último día de un mes.
 */
function lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Limita el día al último día disponible del mes.
 */
export function clampDay(
    year: number,
    month: number,
    day: number
): string {
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error(`Día inválido: ${day}. Debe estar entre 1 y 31.`);
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error(`Mes inválido: ${month}.`);
    }

    const lastDay = lastDayOfMonth(year, month);
    const clampedDay = Math.min(day, lastDay);

    return formatDate(year, month, clampedDay);
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

    if (!Number.isInteger(cutDay) || cutDay < 1 || cutDay > 31) {
        throw new Error("Día de corte inválido.");
    }

    if (day <= cutDay) {
        return clampDay(year, month, cutDay);
    }

    return addMonths(year, month, 1, cutDay);
}

/**
 * Calcula la fecha límite de pago de un corte.
 * Si el día de pago es igual o anterior al corte,
 * pasa al mes siguiente.
 */
export function dueDateFor(
    cutDate: string,
    paymentDay: number
): string {
    const { year, month, day } = parseDate(cutDate);

    if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
        throw new Error("Día de pago inválido.");
    }

    const lastDay = lastDayOfMonth(year, month);

    // Corte ajustado al último día del mes.
    if (day === lastDay && paymentDay > day) {
        return addMonths(year, month, 1, paymentDay);
    }

    // Pago igual o anterior al corte: mes siguiente.
    if (paymentDay <= day) {
        return addMonths(year, month, 1, paymentDay);
    }

    // Pago posterior al corte: mismo mes.
    return clampDay(year, month, paymentDay);
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

    if (!Number.isInteger(cutDay) || cutDay < 1 || cutDay > 31) {
        throw new Error("Día de corte inválido.");
    }

    if (!Number.isInteger(n) || n < 0) {
        throw new Error("La cantidad de cortes debe ser un entero no negativo.");
    }

    return addMonths(year, month, n, cutDay);
}