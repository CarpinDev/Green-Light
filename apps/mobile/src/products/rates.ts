// Tasas: del porcentaje que escribe el usuario ("28,99") a la fracción en texto que espera la API
// ("0.2899"), y de vuelta. Todo con texto y enteros, NUNCA con float: 28.99 / 100 en JS da 0.2899
// por suerte, pero 1.1 / 100 o 0.07 * 100 no, y una tasa guardada con ruido contamina los cálculos.

/** numeric(14,12) en la base: una fracción admite hasta 12 decimales. */
const MAX_FRACTION_DECIMALS = 12;

/**
 * "28,99" o "28.99" -> "0.2899". Mueve el punto decimal dos lugares a la izquierda sobre el texto.
 * Devuelve null si no es un porcentaje válido: letras, negativos, dos separadores, vacío, 100 % o más
 * (ninguna tasa legal llega ahí y la API la rechaza), o más decimales de los que la base guarda.
 */
export function percentToFraction(text: string): string | null {
  const match = /^(\d*)[.,]?(\d*)$/.exec(text.trim());
  if (match === null) return null;
  const [, whole = '', decimals = ''] = match;
  if (whole === '' && decimals === '') return null;

  // Con 2 dígitos de parte entera como mínimo, el punto cabe dos lugares a la izquierda
  const padded = (whole === '' ? '0' : whole).padStart(3, '0');
  const integer = padded.slice(0, -2).replace(/^0+(?=\d)/, '');
  const fraction = (padded.slice(-2) + decimals).replace(/0+$/, '');

  if (integer !== '0') return null; // 100 % o más
  if (fraction.length > MAX_FRACTION_DECIMALS) return null;
  return fraction === '' ? '0' : `0.${fraction}`;
}

/** "0.2899" -> "28,99 %". Lo contrario de percentToFraction, también sobre el texto. Algo raro se deja tal cual. */
export function formatPercent(fraction: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(fraction.trim());
  if (match === null) return fraction;
  const [, whole = '0', decimals = ''] = match;

  // El punto se corre dos lugares a la derecha
  const shifted = decimals.padEnd(2, '0');
  const integer = (whole + shifted.slice(0, 2)).replace(/^0+(?=\d)/, '');
  const rest = shifted.slice(2).replace(/0+$/, '');
  return `${rest === '' ? integer : `${integer},${rest}`} %`;
}

export type RateKind = 'ea' | 'mv';

/** El cuerpo de una tasa para la API: `{ effectiveFrom, ea: '0.2899' }` (o `mv`). null si el porcentaje no vale. */
export function rateBody(
  percent: string,
  kind: RateKind,
  effectiveFrom: string,
): { effectiveFrom: string; ea?: string; mv?: string } | null {
  const fraction = percentToFraction(percent);
  return fraction === null ? null : { effectiveFrom, [kind]: fraction };
}
