import { describe, expect, it } from '@jest/globals';

import { isLast4, parseDay, parseInstallments, sanitizeLast4 } from '@/products/logic';
import { formatPercent, formatPercentShort, percentToFraction, rateBody } from '@/products/rates';

describe('percentToFraction', () => {
  it('convierte con coma o con punto', () => {
    expect(percentToFraction('28,99')).toBe('0.2899');
    expect(percentToFraction('28.99')).toBe('0.2899');
  });

  it('no pierde decimales ni los inventa', () => {
    expect(percentToFraction('1,8')).toBe('0.018');
    expect(percentToFraction('0,5')).toBe('0.005');
    expect(percentToFraction('2,144033')).toBe('0.02144033');
    expect(percentToFraction('99,9999')).toBe('0.999999');
  });

  it('los casos donde un float falla dan el texto exacto', () => {
    // En JS: 0.07 * 100 = 7.000000000000001 y 1.1 / 100 = 0.011000000000000001
    expect(percentToFraction('7')).toBe('0.07');
    expect(percentToFraction('1,1')).toBe('0.011');
    expect(percentToFraction('0,07')).toBe('0.0007');
  });

  it('el cero es "0", sin decimales', () => {
    expect(percentToFraction('0')).toBe('0');
    expect(percentToFraction('0,00')).toBe('0');
    expect(percentToFraction('00')).toBe('0');
  });

  it('quita ceros que sobran, adelante y atrás', () => {
    expect(percentToFraction('028,990')).toBe('0.2899');
    expect(percentToFraction('30,0')).toBe('0.3');
    expect(percentToFraction(' 12 ')).toBe('0.12');
  });

  it('acepta un separador al final o al principio ("28," y ",5")', () => {
    expect(percentToFraction('28,')).toBe('0.28');
    expect(percentToFraction(',5')).toBe('0.005');
  });

  it('rechaza dos separadores, letras, negativos y vacío', () => {
    for (const text of ['1,2,3', '1.2.3', '1,2.3', '12a', 'abc', '-5', '+5', '1e2', '', ' ', ',', '.', '28 %']) {
      expect(percentToFraction(text)).toBeNull();
    }
  });

  it('rechaza 100 % o más: ninguna tasa llega ahí y la API la rechaza', () => {
    expect(percentToFraction('100')).toBeNull();
    expect(percentToFraction('250,5')).toBeNull();
    expect(percentToFraction('99,99')).toBe('0.9999');
  });

  it('rechaza más decimales de los que guarda la base (12 en la fracción)', () => {
    expect(percentToFraction('1,0000000001')).toBe('0.010000000001'); // 12 decimales: cabe
    expect(percentToFraction('1,00000000001')).toBeNull(); // 13: no cabe
  });
});

describe('formatPercent', () => {
  it('muestra la fracción como porcentaje con coma', () => {
    expect(formatPercent('0.2899')).toBe('28,99 %');
    expect(formatPercent('0.275')).toBe('27,5 %');
    expect(formatPercent('0.3')).toBe('30 %');
    expect(formatPercent('0.0204')).toBe('2,04 %');
    expect(formatPercent('0.018')).toBe('1,8 %');
  });

  it('el cero y el 100 %', () => {
    expect(formatPercent('0')).toBe('0 %');
    expect(formatPercent('0.000000000000')).toBe('0 %');
    expect(formatPercent('1')).toBe('100 %');
  });

  it('ignora los ceros finales de la base y conserva los decimales largos', () => {
    expect(formatPercent('0.289900000000')).toBe('28,99 %');
    expect(formatPercent('0.021440335512')).toBe('2,1440335512 %');
  });

  it('es la inversa de percentToFraction', () => {
    for (const percent of ['28,99', '1,8', '0,5', '30', '2,144033', '0,07']) {
      const fraction = percentToFraction(percent);
      expect(fraction).not.toBeNull();
      expect(formatPercent(fraction as string)).toBe(`${percent} %`);
    }
  });

  it('un texto que no es una fracción se deja como llegó', () => {
    expect(formatPercent('abc')).toBe('abc');
    expect(formatPercent('')).toBe('');
  });
});

describe('rateBody', () => {
  it('arma el cuerpo con la E.A. o la M.V. como texto', () => {
    expect(rateBody('28,99', 'ea', '2026-11-12')).toEqual({ effectiveFrom: '2026-11-12', ea: '0.2899' });
    expect(rateBody('2,14', 'mv', '2026-11-12')).toEqual({ effectiveFrom: '2026-11-12', mv: '0.0214' });
  });

  it('null si el porcentaje no vale', () => {
    expect(rateBody('abc', 'ea', '2026-11-12')).toBeNull();
  });
});

describe('sanitizeLast4 e isLast4', () => {
  it('deja solo dígitos y corta a 4: nunca el número completo', () => {
    expect(sanitizeLast4('12a3-4')).toBe('1234');
    expect(sanitizeLast4('4111 1111 1111 1111')).toBe('4111');
    expect(sanitizeLast4('')).toBe('');
  });

  it('solo 4 dígitos exactos valen', () => {
    expect(isLast4('0123')).toBe(true);
    expect(isLast4('123')).toBe(false);
    expect(isLast4('12345')).toBe(false);
    expect(isLast4('12a4')).toBe(false);
  });
});

describe('parseInstallments y parseDay', () => {
  it('las cuotas van de 1 a 72', () => {
    expect(parseInstallments('1')).toBe(1);
    expect(parseInstallments('72')).toBe(72);
    for (const text of ['0', '73', '', 'a', '1.5', '-1', '100']) expect(parseInstallments(text)).toBeNull();
  });

  it('el día va de 1 a 31', () => {
    expect(parseDay('15')).toBe(15);
    expect(parseDay('31')).toBe(31);
    for (const text of ['0', '32', '', 'x', '1,5']) expect(parseDay(text)).toBeNull();
  });
});

describe('formatPercentShort', () => {
  it('redondea a 2 decimales: la M.V. larga queda corta', () => {
    expect(formatPercentShort('0.018769265122')).toBe('1,88 %');
    expect(formatPercentShort('0.0212')).toBe('2,12 %');
  });

  it('quita los ceros que sobran', () => {
    expect(formatPercentShort('0.25')).toBe('25 %');
    expect(formatPercentShort('0.2859')).toBe('28,59 %');
    expect(formatPercentShort('0.021')).toBe('2,1 %');
    expect(formatPercentShort('0')).toBe('0 %');
  });

  it('redondea hacia arriba con acarreo y mantiene el cero de la unidad', () => {
    expect(formatPercentShort('0.00005')).toBe('0,01 %');
    expect(formatPercentShort('0.00004')).toBe('0 %');
    expect(formatPercentShort('0.0999')).toBe('9,99 %');
    expect(formatPercentShort('0.09999')).toBe('10 %');
    expect(formatPercentShort('0.00999')).toBe('1 %');
  });

  it('acepta otra cantidad de decimales y deja tal cual lo que no es una fracción', () => {
    expect(formatPercentShort('0.018769', 3)).toBe('1,877 %');
    expect(formatPercentShort('abc')).toBe('abc');
  });
});
