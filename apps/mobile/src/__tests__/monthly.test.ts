import { describe, expect, it } from '@jest/globals';

import type { MonthlyStatus } from '@/api/types';
import {
  activeTotal,
  monthlyControls,
  nextOccurrenceAfter,
  parseDayOfMonth,
  reactivateMessage,
  splitByStatus,
  terminateMessage,
  terminationDate,
} from '@/monthly/logic';

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

describe('nextOccurrenceAfter', () => {
  it('el día de este mes si todavía no pasó el fin; si no, el del mes siguiente', () => {
    expect(nextOccurrenceAfter('2026-11-12', 15)).toBe('2026-11-15');
    expect(nextOccurrenceAfter('2026-11-12', 1)).toBe('2026-12-01');
    // El mismo día del fin ya cuenta (el fin vale hasta el final de ese día): el primero que no cuenta es el siguiente
    expect(nextOccurrenceAfter('2026-11-12', 12)).toBe('2026-12-12');
  });

  it('cruza el año y recorta en meses cortos', () => {
    expect(nextOccurrenceAfter('2026-12-20', 5)).toBe('2027-01-05');
    expect(nextOccurrenceAfter('2027-01-31', 31)).toBe('2027-02-28');
    expect(nextOccurrenceAfter('2027-02-10', 31)).toBe('2027-02-28');
  });
});

describe('textos de Terminar y Reactivar', () => {
  it('terminar: desde cuándo deja de contar y qué pago ya no se resta', () => {
    expect(terminateMessage({ name: 'Arriendo', dayOfMonth: 1 }, '2026-11-12', 'resta')).toMatch(
      /^Arriendo deja de contar desde el .*12.*\. El pago del .*1.*dic.* ya no se resta\.$/,
    );
  });

  it('un ingreso dice "suma"', () => {
    expect(terminateMessage({ name: 'Salario', dayOfMonth: 30 }, '2026-11-12', 'suma')).toMatch(/ya no se suma\.$/);
  });

  it('reactivar', () => {
    expect(reactivateMessage({ name: 'Arriendo' })).toBe('Arriendo vuelve a contar cada mes desde ahora.');
  });
});

describe('monthlyControls', () => {
  const item = (overrides: Partial<Parameters<typeof monthlyControls>[0]> = {}) => ({
    status: 'active' as MonthlyStatus,
    startDate: '2026-01-01',
    endDate: null as string | null,
    canReactivate: false,
    replacedById: null as number | null,
    ...overrides,
  });

  it('uno vigente sin fin: cambia monto y termina; no reactiva; sin nota', () => {
    expect(monthlyControls(item())).toEqual({ changeAmount: true, terminate: true, reactivate: false, note: null });
  });

  it('uno terminado a mano: se puede reactivar y no se puede cambiar el monto ni terminar', () => {
    const controls = monthlyControls(item({ status: 'ended', endDate: '2026-11-12', canReactivate: true }));
    expect(controls).toMatchObject({ changeAmount: false, terminate: false, reactivate: true });
    expect(controls.note).toMatch(/^Terminó el .*\.$/);
    expect(controls.note).not.toMatch(/reemplaz/);
  });

  it('uno reemplazado por un cambio de monto: no se reactiva y dice que se edite el vigente', () => {
    const controls = monthlyControls(item({ status: 'ended', endDate: '2026-06-30', replacedById: 7 }));
    expect(controls.reactivate).toBe(false);
    expect(controls.note).toMatch(/Lo reemplazó un cambio de monto; edita el vigente\.$/);
  });

  it('uno vigente con fin (futuro, o terminado hoy): Reactivar y no Terminar', () => {
    const controls = monthlyControls(item({ endDate: '2026-11-30', canReactivate: true }));
    expect(controls).toMatchObject({ terminate: false, reactivate: true });
    expect(controls.note).toMatch(/^Termina el /);
  });

  it('uno que todavía no empieza: solo cambiar el monto, con su nota', () => {
    const controls = monthlyControls(item({ status: 'upcoming', startDate: '2027-01-01' }));
    expect(controls).toMatchObject({ changeAmount: true, terminate: false, reactivate: false });
    expect(controls.note).toMatch(/^Empieza el /);
  });
});
