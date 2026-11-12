// Lógica pura de los formularios de productos.

/** Lo que se escribe en el campo de los últimos 4: solo dígitos, máximo 4 (nunca el número completo). */
export function sanitizeLast4(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4);
}

export const isLast4 = (text: string): boolean => /^\d{4}$/.test(text);

/** Cuotas de una deuda: un entero de 1 a 72 (el tope del motor), o null. */
export function parseInstallments(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 72 ? n : null;
}

/** El día de corte o de pago: un entero de 1 a 31, o null. */
export function parseDay(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 31 ? n : null;
}
