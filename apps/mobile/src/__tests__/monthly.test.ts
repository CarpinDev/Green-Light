import { describe, expect, it } from '@jest/globals';

import type { MonthlyStatus } from '@/api/types';
import { activeTotal, parseDayOfMonth, splitByStatus, terminationDate } from '@/monthly/logic';

const item = (amountCents: number, status: MonthlyStatus) => ({ amountCents, status });

describe('splitByStatus', () => {
  it('separa vigentes de terminados sin cambiar el orden', () => {
    const items: { id: number; status: MonthlyStatus }[] = [
      { id: 1, status: 'active' },
      { id: 2, status: 'ended' },
      { id: 3, status: 'upcoming' },
      { id: 4, status: 'active' },
    ];
    const { upcoming, active, ended } = splitByStatus(items);
    expect(active.map((i) => i.id)).toEqual([1, 4]);
    expect(upcoming.map((i) => i.id)).toEqual([3]);
    expect(ended.map((i) => i.id)).toEqual([2]);
  });

  it('una lista vacía da dos grupos vacíos', () => {
    expect(splitByStatus([])).toEqual({ upcoming: [], active: [], ended: [] });
  });
});

describe('activeTotal', () => {
  it('suma solo los que rigen hoy', () => {
    expect(activeTotal([item(300, 'active'), item(100, 'ended'), item(50, 'active')])).toBe(350);
  });

  it('un cambio de monto futuro no cuenta doble: el próximo no suma', () => {
    // El salario viejo rige hasta el 30 de noviembre; el nuevo todavía no empieza
    expect(activeTotal([item(300_000_000, 'active'), item(350_000_000, 'upcoming')])).toBe(300_000_000);
  });

  it('sin vigentes, 0', () => {
    expect(activeTotal([item(100, 'ended'), item(100, 'upcoming')])).toBe(0);
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
