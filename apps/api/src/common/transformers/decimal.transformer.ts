import Decimal from 'decimal.js';

/**
 * Columna numeric <-> Decimal. pg devuelve numeric como string; se convierte sin pasar por
 * number para no perder dígitos, y se guarda en notación completa (nunca '1e-7').
 */
export const decimalTransformer = {
  from(value: string | null): Decimal | null {
    // new Decimal lanza si el texto no es un número
    return value === null ? null : new Decimal(value);
  },

  to<T extends Decimal | null | undefined>(value: T): string | Exclude<T, Decimal> {
    if (value === null || value === undefined) return value as Exclude<T, Decimal>;
    return value.toFixed();
  },
};
