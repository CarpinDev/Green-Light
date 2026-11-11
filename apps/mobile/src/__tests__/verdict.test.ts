import { describe, expect, it } from '@jest/globals';

import type { MonthSummary } from '@/api/types';
import { verdict, worstLight } from '@/simulator/verdict';

const month = (m: string, light: MonthSummary['light']): MonthSummary => ({
  month: m,
  openingBalance: 0,
  income: 0,
  outflow: 0,
  closingBalance: 0,
  lowestBalance: 0,
  referenceIncome: 0,
  light,
  events: [],
});

describe('worstLight', () => {
  it('el rojo gana sobre el amarillo, y el amarillo sobre el verde', () => {
    expect(worstLight([month('2026-11', 'green'), month('2026-12', 'yellow')], '2026-11')).toBe('yellow');
    expect(
      worstLight([month('2026-11', 'yellow'), month('2026-12', 'red'), month('2027-01', 'green')], '2026-11'),
    ).toBe('red');
  });

  it('todo verde es verde', () => {
    expect(worstLight([month('2026-11', 'green'), month('2026-12', 'green')], '2026-11')).toBe('green');
  });

  it('ignora los meses anteriores al actual', () => {
    expect(worstLight([month('2026-09', 'red'), month('2026-11', 'green')], '2026-11')).toBe('green');
  });

  it('sin meses es verde', () => {
    expect(worstLight([], '2026-11')).toBe('green');
  });
});

describe('verdict', () => {
  it('verde: puedes', () => {
    expect(verdict('green', false)).toEqual({ light: 'green', label: 'Puedes' });
  });

  it('amarillo: justo', () => {
    expect(verdict('yellow', false)).toEqual({ light: 'yellow', label: 'Justo' });
  });

  it('rojo: no alcanza', () => {
    expect(verdict('red', false)).toEqual({ light: 'red', label: 'No alcanza' });
  });

  it('si no cabe en el cupo, es rojo aunque el semáforo esté en verde', () => {
    expect(verdict('green', true)).toEqual({ light: 'red', label: 'No cabe en el cupo' });
  });
});
