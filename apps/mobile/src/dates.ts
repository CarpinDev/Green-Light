/** El mes de hoy como YYYY-MM, en hora local (toISOString daría el de UTC). */
export function currentMonth(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

const parts = (iso: string) => {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** "2026-03-25" -> "25 mar 2026" */
export function formatDay(iso: string): string {
  return parts(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2026-03" -> "marzo 2026" */
export function formatMonth(month: string): string {
  return parts(`${month}-01`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

/** Más de esta cantidad de días desde el último saldo, la proyección merece un aviso. */
export const STALE_DAYS = 7;

/** Días de `from` a `to` (YYYY-MM-DD). Cuenta en UTC para que la zona horaria y el horario de verano no muevan el resultado. */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Hoy como YYYY-MM-DD, en hora local (toISOString daría el día de UTC, y de noche en Colombia ya es mañana). */
export function today(now: Date = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const monthNumber = (iso: string) => Number(iso.split('-')[1] ?? 1);

/** "2026-11" -> "noviembre". Sin año: para frases como "Cierras noviembre con". */
export function formatMonthName(month: string): string {
  return MONTH_NAMES[monthNumber(month) - 1] ?? '';
}

/** "2026-11" -> "Nov". Tres letras, para las etiquetas de una gráfica. */
export function formatMonthShort(month: string): string {
  const name = formatMonthName(month);
  return name.charAt(0).toUpperCase() + name.slice(1, 3);
}

/** "2026-11-28" -> "28 nov". Sin año: para fechas cercanas. */
export function formatDayShort(iso: string): string {
  const day = Number(iso.split('-')[2] ?? 1);
  return `${day} ${formatMonthName(iso).slice(0, 3)}`;
}
