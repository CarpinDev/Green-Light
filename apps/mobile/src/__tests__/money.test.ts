import { describe, expect, it } from '@jest/globals';

import { formatCop, parsePesos, parseSignedPesos } from '@/money';

describe('parsePesos', () => {
  it('convierte pesos a centavos, con o sin puntos', () => {
    expect(parsePesos('120.000')).toBe(12_000_000);
    expect(parsePesos('120000')).toBe(12_000_000);
  });

  it('ignora los espacios', () => {
    expect(parsePesos(' 1 200 ')).toBe(120_000);
  });

  it('con letras da null', () => {
    expect(parsePesos('12a')).toBeNull();
    expect(parsePesos('abc')).toBeNull();
  });

  it('un negativo da null: un gasto nunca es negativo', () => {
    expect(parsePesos('-5')).toBeNull();
  });

  it('vacío da null', () => {
    expect(parsePesos('')).toBeNull();
    expect(parsePesos('   ')).toBeNull();
  });
});

describe('parseSignedPesos', () => {
  it('acepta un - al inicio (sobregiro)', () => {
    expect(parseSignedPesos('-50.000')).toBe(-5_000_000);
  });

  it('sin signo se comporta como parsePesos', () => {
    expect(parseSignedPesos('50.000')).toBe(5_000_000);
  });

  it('"-0" da 0, no -0', () => {
    // toBe(0) no distingue -0 de 0
    expect(Object.is(parseSignedPesos('-0'), 0)).toBe(true);
  });

  it('un - solo, o dos, da null', () => {
    expect(parseSignedPesos('-')).toBeNull();
    expect(parseSignedPesos('--5')).toBeNull();
  });

  it('texto que no es un número da null', () => {
    expect(parseSignedPesos('abc')).toBeNull();
    expect(parseSignedPesos('')).toBeNull();
  });
});

describe('formatCop', () => {
  // Sin texto exacto: el espacio después del $ cambia según el motor de Intl
  it('da pesos con punto de miles', () => {
    expect(formatCop(123_456_700)).toMatch(/1\.234\.567/);
  });

  it('un saldo negativo conserva el signo', () => {
    expect(formatCop(-5_000_000)).toMatch(/-.*50\.000/);
  });
});
