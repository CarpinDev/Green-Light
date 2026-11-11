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
