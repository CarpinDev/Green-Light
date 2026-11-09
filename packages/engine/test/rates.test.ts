import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { eaToMv, mvToEa, rateFromEa, RateHistory } from '../src/rates';

describe('rates', () => {
  describe('conversión E.A. ↔ M.V.', () => {
    it('1 % M.V. equivale exactamente a 12,6825 % E.A.', () => {
      // (1.01)^12 − 1 = 0.126825030131969720661201
      expect(mvToEa(new Decimal('0.01')).toFixed(12)).toBe('0.126825030132');
    });

    it('convertir ida y vuelta conserva la tasa', () => {
      const ea = new Decimal('0.2899');
      expect(mvToEa(eaToMv(ea)).minus(ea).abs().lt('1e-10')).toBe(true);
    });

    it('28,99 % E.A. da una M.V. de ~2,144 % (no 28,99/12)', () => {
      const mv = eaToMv(new Decimal('0.2899'));
      expect(mv.gt('0.0214') && mv.lt('0.0215')).toBe(true);
    });

    it('rechaza tasas negativas', () => {
      expect(() => rateFromEa('-0.1')).toThrow();
    });
  });

  describe('RateHistory', () => {
    it('devuelve la tasa vigente en cada fecha aunque se agreguen desordenadas', () => {
      const h = new RateHistory();
      h.add('2026-03-01', rateFromEa('0.30'));
      h.add('2026-01-01', rateFromEa('0.28'));
      expect(h.rateOn('2026-02-28').ea.toString()).toBe('0.28');
      expect(h.rateOn('2026-03-01').ea.toString()).toBe('0.3');
    });

    it('lanza error si no hay tasa vigente para la fecha', () => {
      const h = new RateHistory();
      h.add('2026-01-01', rateFromEa('0.28'));
      expect(() => h.rateOn('2025-12-31')).toThrow();
    });
  });
});