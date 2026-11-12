const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Centavos como pesos para un mensaje: 393388300 -> "$ 3.933.883". */
export function formatCop(cents: number): string {
  return cop.format(cents / 100).replace(/\s/g, ' ');
}
