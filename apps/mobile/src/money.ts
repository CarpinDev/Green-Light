const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Centavos a pesos con formato: 123456700 -> "$ 1.234.567". La única conversión de centavos de la app. */
export function formatCop(cents: number): string {
  return cop.format(cents / 100);
}

/** Pesos que escribió el usuario a centavos: "120.000" -> 12000000. Quita puntos y espacios; null si no son solo dígitos. */
export function parsePesos(text: string): number | null {
  const digits = text.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const cents = Number(digits) * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}
