import { describe, expect, it } from '@jest/globals';

import { formatCop, formatCopShort, formatMoneyInput, moneyText, parsePesos, parseSignedPesos } from '@/money';

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

describe('formatMoneyInput', () => {
  // Sin texto exacto: el espacio después del $ cambia según el motor de Intl
  it('formatea mientras escribe: "120000" -> "$ 120.000" con sus centavos', () => {
    const result = formatMoneyInput('120000');
    expect(result?.text).toMatch(/^\$\s120\.000$/);
    expect(result?.cents).toBe(12_000_000);
  });

  it('reformatea un texto ya formateado al agregarle un dígito', () => {
    const first = formatMoneyInput('1200');
    const result = formatMoneyInput(`${first?.text}0`);
    expect(result?.text).toMatch(/12\.000$/);
    expect(result?.cents).toBe(1_200_000);
  });

  it('ignora todo lo que no sea un dígito', () => {
    expect(formatMoneyInput('1a2b3')?.cents).toBe(12_300);
    expect(formatMoneyInput('$ 1.500')?.cents).toBe(150_000);
  });

  it('un campo vacío no tiene monto', () => {
    expect(formatMoneyInput('')).toEqual({ text: '', cents: null });
    expect(formatMoneyInput('$ ')).toEqual({ text: '', cents: null });
  });

  it('los ceros a la izquierda no cuentan', () => {
    expect(formatMoneyInput('007')?.cents).toBe(700);
  });

  it('sin allowNegative, un "-" se ignora', () => {
    expect(formatMoneyInput('-500')?.cents).toBe(50_000);
    expect(formatMoneyInput('-')).toEqual({ text: '', cents: null });
  });

  it('con allowNegative, un "-" al inicio da un monto negativo', () => {
    const result = formatMoneyInput('-50000', true);
    expect(result?.text).toMatch(/^-\$\s50\.000$/);
    expect(result?.cents).toBe(-5_000_000);
  });

  it('con allowNegative, un "-" solo se queda como "-", sin monto', () => {
    expect(formatMoneyInput('-', true)).toEqual({ text: '-', cents: null });
  });

  it('"-0" da 0, no -0', () => {
    expect(Object.is(formatMoneyInput('-0', true)?.cents, 0)).toBe(true);
  });

  it('un número que no cabe en un entero seguro se rechaza (null)', () => {
    expect(formatMoneyInput('9'.repeat(30))).toBeNull();
  });
});

describe('moneyText', () => {
  it('null es un campo vacío', () => {
    expect(moneyText(null)).toBe('');
  });

  it('un monto positivo y uno negativo', () => {
    expect(moneyText(12_000_000)).toMatch(/120\.000/);
    expect(moneyText(-5_000_000)).toMatch(/^-.*50\.000$/);
  });

  it('coincide con lo que formatMoneyInput escribe', () => {
    const typed = formatMoneyInput('-75000', true);
    expect(moneyText(typed?.cents ?? null)).toBe(typed?.text);
  });
});

describe('formatCopShort', () => {
  const pesos = (n: number) => Math.round(n * 100);

  it('menos de mil pesos: el valor completo', () => {
    expect(formatCopShort(pesos(850))).toBe('$850');
    expect(formatCopShort(0)).toBe('$0');
    expect(formatCopShort(pesos(999))).toBe('$999');
  });

  it('de mil a menos de un millón: en miles sin decimales', () => {
    expect(formatCopShort(pesos(1000))).toBe('$1 mil');
    expect(formatCopShort(pesos(793_400))).toBe('$793 mil');
    expect(formatCopShort(pesos(120_000))).toBe('$120 mil');
  });

  it('un millón o más: en millones con 2 decimales y sin ceros de sobra', () => {
    expect(formatCopShort(pesos(1_160_000))).toBe('$1,16 M');
    expect(formatCopShort(pesos(1_083_568))).toBe('$1,08 M');
    expect(formatCopShort(pesos(2_000_000))).toBe('$2 M');
    expect(formatCopShort(pesos(1_500_000))).toBe('$1,5 M');
    expect(formatCopShort(pesos(1_000_000))).toBe('$1 M');
    expect(formatCopShort(pesos(12_345_678))).toBe('$12,35 M');
  });

  it('redondea y no trunca en los bordes', () => {
    expect(formatCopShort(pesos(999.6))).toBe('$1 mil');
    expect(formatCopShort(pesos(999_600))).toBe('$1 M');
    expect(formatCopShort(pesos(999_499))).toBe('$999 mil');
    expect(formatCopShort(pesos(1_004_999))).toBe('$1 M');
    expect(formatCopShort(pesos(1_005_000))).toBe('$1,01 M');
  });

  it('los negativos llevan el signo de formatCop', () => {
    const minus = formatCop(-5_000_000).trim().charAt(0);
    expect(formatCopShort(pesos(-120_000))).toBe(`${minus}$120 mil`);
    expect(formatCopShort(pesos(-1_160_000))).toBe(`${minus}$1,16 M`);
    expect(formatCopShort(pesos(-850))).toBe(`${minus}$850`);
    // Algo que redondea a 0 no lleva signo
    expect(formatCopShort(-10)).toBe('$0');
  });
});
