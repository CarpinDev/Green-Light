const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Centavos a pesos con formato: 123456700 -> "$ 1.234.567". La única conversión de centavos de la app. */
export function formatCop(cents: number): string {
  return cop.format(cents / 100);
}

/** El signo de menos que usa formatCop (el de Intl en es-CO), para que las etiquetas cortas se lean igual. */
const MINUS = cop.format(-1).trim().charAt(0) || '-';

/**
 * Pesos para etiquetas estrechas (6 columnas en un celular): "$850", "$793 mil", "$1,16 M". Redondea, no trunca:
 * 999.600 pesos son "$1 M", no "$1.000 mil". Los negativos llevan el signo de formatCop: "−$120 mil".
 */
export function formatCopShort(cents: number): string {
  const text = shortAmount(Math.abs(cents) / 100);
  return cents < 0 && text !== '$0' ? `${MINUS}${text}` : text;
}

function shortAmount(pesos: number): string {
  const whole = Math.round(pesos);
  if (whole < 1000) return `$${whole}`;

  const thousands = Math.round(pesos / 1000);
  if (thousands < 1000) return `$${thousands} mil`;

  // Millones con 2 decimales, en centésimas enteras para no arrastrar ruido de float
  const hundredths = Math.round(pesos / 10_000);
  const integer = Math.floor(hundredths / 100);
  const decimals = String(hundredths % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `$${decimals === '' ? integer : `${integer},${decimals}`} M`;
}

/** Pesos que escribió el usuario a centavos: "120.000" -> 12000000. Quita puntos y espacios; null si no son solo dígitos. */
export function parsePesos(text: string): number | null {
  const digits = text.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const cents = Number(digits) * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos como el campo de dinero los muestra: 12000000 -> "$ 120.000", -5000000 -> "-$ 50.000"; null -> "". */
export function moneyText(cents: number | null): string {
  if (cents === null) return '';
  return cents < 0 ? `-${formatCop(-cents)}` : formatCop(cents);
}

/**
 * Lo que el usuario escribió en un campo de dinero, ya formateado: "120000" -> "$ 120.000" con sus
 * centavos. Solo cuentan los dígitos; con `allowNegative`, un "-" al inicio vuelve negativo el monto
 * (un "-" solo se queda como "-", todavía sin monto). Devuelve null si el número no cabe: el campo
 * ignora ese cambio y se queda con lo que tenía.
 */
export function formatMoneyInput(text: string, allowNegative = false): { text: string; cents: number | null } | null {
  const negative = allowNegative && text.trimStart().startsWith('-');
  const digits = text.replace(/\D/g, '');
  if (digits === '') return { text: negative ? '-' : '', cents: null };

  const cents = parsePesos(digits);
  if (cents === null) return null;
  const signed = negative ? -cents || 0 : cents;
  return { text: negative ? `-${formatCop(cents)}` : formatCop(cents), cents: signed };
}

/** Como parsePesos, pero acepta un "-" al inicio: un saldo puede ser negativo (sobregiro). "-0" da 0, no -0. */
export function parseSignedPesos(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('-')) return parsePesos(trimmed);
  const cents = parsePesos(trimmed.slice(1));
  return cents === null ? null : -cents || 0;
}
