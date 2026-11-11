import { describe, expect, it } from '@jest/globals';

import { currentMonth, daysBetween, formatDayShort, formatMonthName, formatMonthShort, today } from '@/dates';

describe('today', () => {
  it('usa el día local: a las 11:30 pm sigue siendo el mismo día (toISOString daría el de UTC)', () => {
    expect(today(new Date(2026, 2, 5, 23, 30))).toBe('2026-03-05');
  });

  it('rellena mes y día con cero', () => {
    expect(today(new Date(2026, 0, 3, 8, 0))).toBe('2026-01-03');
  });
});

describe('currentMonth', () => {
  it('enero lleva el cero: 2026-01', () => {
    expect(currentMonth(new Date(2026, 0, 15))).toBe('2026-01');
  });

  it('diciembre no lo necesita', () => {
    expect(currentMonth(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
  });
});

describe('daysBetween', () => {
  it('el mismo día son 0', () => {
    expect(daysBetween('2026-11-11', '2026-11-11')).toBe(0);
  });

  it('dentro del mes', () => {
    expect(daysBetween('2026-10-02', '2026-10-09')).toBe(7);
  });

  it('a través de un cambio de mes', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });

  it('a través de un cambio de año', () => {
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
  });

  it('un año bisiesto tiene 29 de febrero', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('si la fecha final es anterior da negativo', () => {
    expect(daysBetween('2026-10-09', '2026-10-02')).toBe(-7);
  });
});

describe('formatos cortos', () => {
  it('formatMonthName: solo el nombre del mes', () => {
    expect(formatMonthName('2026-11')).toBe('noviembre');
    expect(formatMonthName('2026-01')).toBe('enero');
  });

  it('formatMonthShort: tres letras con mayúscula inicial', () => {
    expect(formatMonthShort('2026-11')).toBe('Nov');
    expect(formatMonthShort('2027-09')).toBe('Sep');
  });

  it('formatDayShort: día y mes corto, sin año ni cero a la izquierda', () => {
    expect(formatDayShort('2026-11-28')).toBe('28 nov');
    expect(formatDayShort('2026-03-05')).toBe('5 mar');
  });
});
