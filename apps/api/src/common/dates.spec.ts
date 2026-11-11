import { BadRequestException } from '@nestjs/common';
import { assertDateRange, isoDateOf } from './dates';

describe('isoDateOf', () => {
  it('da la fecha local como YYYY-MM-DD', () => {
    expect(isoDateOf(new Date(2026, 10, 11, 9, 5))).toBe('2026-11-11');
    expect(isoDateOf(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('a las 11 p. m. sigue siendo el mismo día (toISOString lo pasaría al siguiente en UTC-5)', () => {
    expect(isoDateOf(new Date(2026, 10, 11, 23, 30))).toBe('2026-11-11');
  });

  it('sin argumento usa el día de hoy', () => {
    expect(isoDateOf()).toBe(isoDateOf(new Date()));
  });
});

describe('assertDateRange', () => {
  it('acepta un fin igual o posterior al inicio, o sin fin', () => {
    expect(() => assertDateRange('2026-01-01', undefined)).not.toThrow();
    expect(() => assertDateRange('2026-01-01', '2026-01-01')).not.toThrow();
  });

  it('un fin anterior al inicio es 400', () => {
    expect(() => assertDateRange('2026-06-01', '2026-01-01')).toThrow(BadRequestException);
  });
});
