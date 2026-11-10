import type { Cents } from '@greenlight/engine';

/**
 * Columna bigint <-> Cents. pg devuelve bigint como string para no perder precisión;
 * aquí se vuelve number y se rechaza cualquier valor que no sea un entero seguro.
 */
export const centsTransformer = {
  from(value: string | null): Cents | null {
    if (value === null) return null;
    if (!/^-?\d+$/.test(value)) {
      throw new RangeError(`bigint inválido para centavos: "${value}"`);
    }
    const cents = Number(value);
    assertSafeCents(cents, value);
    return cents;
  },

  to<T extends Cents | null | undefined>(value: T): T {
    if (value !== null && value !== undefined) assertSafeCents(value, String(value));
    return value;
  },
};

function assertSafeCents(cents: number, raw: string): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`centavos fuera de rango o con decimales: ${raw}`);
  }
}
