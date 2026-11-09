/**
 * Formatea una fecha como YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");

    return `${year}-${m}-${d}`;
}

/**
 * Parsea una fecha YYYY-MM-DD en [año, mes, día].
 * Lanza un error si el formato es inválido.
 */
function parseDate(date: string): [number, number, number] {
    const [year, month, day] = date.split("-").map(Number);

    if (year === undefined || month === undefined || day === undefined) {
        throw new Error(`Fecha inválida: ${date}`);
    }

    return [year, month, day];
}

/**
 * Obtiene el último día de un mes.
 * month utiliza formato 1-12.
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
    const lastDay = lastDayOfMonth(year, month);
    const clampedDay = Math.min(Math.max(day, 1), lastDay);

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
    const [year, month, day] = parseDate(purchaseDate);

    if (day <= cutDay) {
        return clampDay(year, month, cutDay);
    }

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return clampDay(nextYear, nextMonth, cutDay);
}

/**
 * Calcula la fecha límite de pago de un corte.
 * Si paymentDay <= cutDay, pasa al mes siguiente.
 */
export function dueDateFor(
    cutDate: string,
    paymentDay: number
): string {
    const [year, month, cutDay] = parseDate(cutDate);

    if (paymentDay <= cutDay) {
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;

        return clampDay(nextYear, nextMonth, paymentDay);
    }

    return clampDay(year, month, paymentDay);
}

/**
 * Calcula el N-ésimo corte posterior a una fecha de compra.
 *
 * Importante: conserva el día configurado del corte.
 * Ejemplo: corte 31 → febrero 28 → marzo 31.
 */
export function nthCutAfter(
    purchaseDate: string,
    cutDay: number,
    n: number
): string {
    const [year, month] = parseDate(purchaseDate);

    const totalMonths = year * 12 + (month - 1) + n;

    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1;

    return clampDay(targetYear, targetMonth, cutDay);
}