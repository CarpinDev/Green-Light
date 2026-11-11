import Decimal from 'decimal.js';
import { centsTransformer } from './cents.transformer';
import { decimalTransformer } from './decimal.transformer';

// Va en apps/api/src/common/transformers/. Los transformers son el único punto donde
// los tipos de Postgres (bigint y numeric llegan como string) se vuelven tipos del motor.

describe('centsTransformer: bigint <-> Cents', () => {
  describe('from (base -> app)', () => {
    it('pg devuelve bigint como string: lo pasa a number', () => {
      expect(centsTransformer.from('150000000')).toBe(150_000_000);
      expect(centsTransformer.from('-2500')).toBe(-2_500);
      expect(centsTransformer.from('0')).toBe(0);
    });

    it('respeta las columnas nulas', () => {
      expect(centsTransformer.from(null)).toBeNull();
    });

    it('rechaza un valor que no cabe en un number sin perder precisión', () => {
      expect(() => centsTransformer.from('9007199254740993')).toThrow(RangeError);
    });

    it('rechaza algo que no es un entero', () => {
      expect(() => centsTransformer.from('10.5')).toThrow(RangeError);
      expect(() => centsTransformer.from('abc')).toThrow(RangeError);
    });
  });

  describe('to (app -> base)', () => {
    it('deja pasar centavos enteros', () => {
      expect(centsTransformer.to(150_000_000)).toBe(150_000_000);
      expect(centsTransformer.to(-1)).toBe(-1);
    });

    it('deja pasar null y undefined (columna opcional o update parcial)', () => {
      expect(centsTransformer.to(null)).toBeNull();
      expect(centsTransformer.to(undefined)).toBeUndefined();
    });

    it('nunca guarda decimales ni números inseguros', () => {
      expect(() => centsTransformer.to(10.5)).toThrow(RangeError);
      expect(() => centsTransformer.to(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
      expect(() => centsTransformer.to(NaN)).toThrow(RangeError);
    });
  });
});

describe('decimalTransformer: numeric <-> Decimal', () => {
  describe('from', () => {
    it('pg devuelve numeric como string: lo pasa a Decimal sin perder dígitos', () => {
      const ea = decimalTransformer.from('0.289900000000');
      expect(ea).toBeInstanceOf(Decimal);
      expect(ea?.equals(new Decimal('0.2899'))).toBe(true);
    });

    it('respeta las columnas nulas (p. ej. promo_ea)', () => {
      expect(decimalTransformer.from(null)).toBeNull();
    });

    it('rechaza texto que no es un número', () => {
      expect(() => decimalTransformer.from('abc')).toThrow();
    });
  });

  describe('to', () => {
    it('guarda el texto exacto, sin notación científica', () => {
      // new Decimal('0.0000001').toString() da '1e-7', que Postgres sí entiende,
      // pero en la base y en los logs queremos siempre el número completo
      expect(decimalTransformer.to(new Decimal('0.0000001'))).toBe('0.0000001');
      expect(decimalTransformer.to(new Decimal('0.2899'))).toBe('0.2899');
    });

    it('deja pasar null y undefined', () => {
      expect(decimalTransformer.to(null)).toBeNull();
      expect(decimalTransformer.to(undefined)).toBeUndefined();
    });

    it('ida y vuelta conserva el valor', () => {
      const mv = new Decimal('0.021432916942');
      expect(decimalTransformer.from(decimalTransformer.to(mv))?.equals(mv)).toBe(true);
    });
  });
});
