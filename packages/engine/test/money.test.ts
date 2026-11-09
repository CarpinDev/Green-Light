import Decimal from 'decimal.js';

import { describe, expect, it } from 'vitest';
import { pesos, roundCents, formatCop } from '../src/money';



describe('money', () => {
  it('convierte pesos a centavos', () => {
    expect(pesos(1_500_000)).toBe(150_000_000);
    expect(pesos('1234.565')).toBe(123_457); // redondeo half-up
  });
  it('rechaza decimales con float', () => {
    expect(() => pesos(10.5)).toThrow();
  });
  it('redondea half-up', () => {
    expect(roundCents(new Decimal('0.5'))).toBe(1);
    expect(roundCents(new Decimal('2.4999'))).toBe(2);
  });
  it('formatea en COP', () => {
    expect(formatCop(123_456_789)).toBe('$1.234.567,89');
    expect(formatCop(pesos(1_234_567))).toBe('$1.234.567');
  });
   it("formatea valores negativos correctamente", () => {
        expect(formatCop(-5)).toBe("-$0,05");
    });
});
