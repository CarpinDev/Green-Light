import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { eaToMv, mvToEa } from '@greenlight/engine';
import { resolveRate } from './resolve-rate';

// Va en apps/api/src/products/. El usuario puede dar la E.A., la M.V. o las dos (como vienen
// en el extracto). resolveRate decide qué se guarda en product_rate. Función pura.

const D = (v: string) => new Decimal(v);

describe('resolveRate', () => {
  it('solo E.A.: calcula la M.V. con el motor y marca source = ea', () => {
    const r = resolveRate({ ea: '0.2899' });
    expect(r.source).toBe('ea');
    expect(r.ea.equals(D('0.2899'))).toBe(true);
    expect(r.mv.equals(eaToMv(D('0.2899')))).toBe(true);
  });

  it('solo M.V.: calcula la E.A. y marca source = mv', () => {
    const r = resolveRate({ mv: '0.015' });
    expect(r.source).toBe('mv');
    expect(r.ea.equals(mvToEa(D('0.015')))).toBe(true);
  });

  it('las dos y equivalentes: guarda ambas tal cual llegaron, source = both', () => {
    // El banco publica la M.V. redondeada a 2 decimales del porcentaje: 2,14 % para 28,99 % E.A.
    const r = resolveRate({ ea: '0.2899', mv: '0.0214' });
    expect(r.source).toBe('both');
    expect(r.ea.equals(D('0.2899'))).toBe(true);
    expect(r.mv.equals(D('0.0214'))).toBe(true);
  });

  it('acepta la M.V. si difiere de la calculada hasta media centésima de punto (0,00005)', () => {
    // eaToMv(0.2899) ≈ 0.021440335: 2,14 % difiere 0.0000403 (pasa); 2,15 % difiere 0.0000597 (no)
    expect(() => resolveRate({ ea: '0.2899', mv: '0.0214' })).not.toThrow();
    expect(() => resolveRate({ ea: '0.2899', mv: '0.0215' })).toThrow(BadRequestException);
  });

  it('las dos y no cuadran (p. ej. un dígito mal digitado): 400', () => {
    expect(() => resolveRate({ ea: '0.2899', mv: '0.0241' })).toThrow(BadRequestException);
  });

  it('ninguna: 400', () => {
    expect(() => resolveRate({})).toThrow(BadRequestException);
  });

  it('negativa o que no es número: 400 (no un 500)', () => {
    expect(() => resolveRate({ ea: '-0.1' })).toThrow(BadRequestException);
    expect(() => resolveRate({ mv: 'abc' })).toThrow(BadRequestException);
  });
});
