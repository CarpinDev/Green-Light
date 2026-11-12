import { describe, expect, it } from '@jest/globals';

import { activeTotal, parseDayOfMonth, splitByActive, terminationDate } from '@/monthly/logic';

const item = (amountCents: number, active: boolean) => ({ amountCents, active });

describe('splitByActive', () => {
  it('separa vigentes de terminados sin cambiar el orden', () => {
    const items = [
      { id: 1, active: true },
      { id: 2, active: false },
      { id: 3, active: true },
    ];
    const { active, ended } = splitByActive(items);
    expect(active.map((i) => i.id)).toEqual([1, 3]);
    expect(ended.map((i) => i.id)).toEqual([2]);
  });

  it('una lista vacía da dos grupos vacíos', () => {
    expect(splitByActive([])).toEqual({ active: [], ended: [] });
  });
});

describe('activeTotal', () => {
  it('suma solo los vigentes', () => {
    expect(activeTotal([item(300, true), item(100, false), item(50, true)])).toBe(350);
  });

  it('sin vigentes, 0', () => {
    expect(activeTotal([item(100, false)])).toBe(0);
    expect(activeTotal([])).toBe(0);
  });
});

describe('terminationDate', () => {
  const now = new Date(2026, 10, 11, 21, 30); // 11 de noviembre de 2026, 9:30 p. m. local

  it('termina hoy (en hora local, no UTC)', () => {
    expect(terminationDate('2026-01-01', now)).toBe('2026-11-11');
  });

  it('uno que empieza hoy termina hoy', () => {
    expect(terminationDate('2026-11-11', now)).toBe('2026-11-11');
  });

  it('uno que todavía no empieza termina el día que empieza, no antes', () => {
    expect(terminationDate('2026-12-01', now)).toBe('2026-12-01');
  });
});

describe('parseDayOfMonth', () => {
  it('acepta de 1 a 31', () => {
    expect(parseDayOfMonth('1')).toBe(1);
    expect(parseDayOfMonth(' 31 ')).toBe(31);
    expect(parseDayOfMonth('05')).toBe(5);
  });

  it('rechaza 0, 32, vacío y lo que no es un entero', () => {
    for (const text of ['', '0', '32', '99', 'a', '1.5', '-3', '100']) {
      expect(parseDayOfMonth(text)).toBeNull();
    }
  });
});
