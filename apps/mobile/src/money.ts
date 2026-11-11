const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Centavos a pesos con formato: 123456700 -> "$ 1.234.567". La única conversión de centavos de la app. */
export function formatCop(cents: number): string {
  return cop.format(cents / 100);
}
