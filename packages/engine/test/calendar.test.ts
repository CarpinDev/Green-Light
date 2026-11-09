import { describe, expect, it } from 'vitest';
import { clampDay, cutDateFor, dueDateFor, nthCutAfter } from '../src/calendar';

describe('calendar', () => {
  describe('clampDay', () => {
    it('usa el último día del mes si el día no existe', () => {
      expect(clampDay(2026, 2, 31)).toBe('2026-02-28');
    });

    it('respeta el 29 de febrero en año bisiesto', () => {
      expect(clampDay(2028, 2, 30)).toBe('2028-02-29');
    });
  });

  describe('cutDateFor: en qué corte cae una compra', () => {
    it.each([
      ['2026-11-10', 15, '2026-11-15', 'antes del corte → corte del mismo mes'],
      ['2026-11-15', 15, '2026-11-15', 'el mismo día del corte → entra a ese corte'],
      ['2026-11-16', 15, '2026-12-15', 'después del corte → corte del mes siguiente'],
      ['2026-12-20', 15, '2027-01-15', 'diciembre después del corte → enero del año siguiente'],
      ['2026-01-31', 30, '2026-02-28', 'corte día 30 en febrero → último día del mes'],
    ])('compra el %s con corte día %i → %s (%s)', (purchase, cutDay, expected) => {
      expect(cutDateFor(purchase, cutDay)).toBe(expected);
    });
  });

  describe('dueDateFor: fecha límite de pago de un corte', () => {
    it('si el día de pago es menor al de corte, cae el mes siguiente', () => {
      expect(dueDateFor('2026-11-15', 1)).toBe('2026-12-01');
    });

    it('si el día de pago es posterior al corte, cae el mismo mes', () => {
      expect(dueDateFor('2026-11-05', 25)).toBe('2026-11-25');
    });

    it('si coincide con el día de corte, pasa al mes siguiente (y cambia de año)', () => {
      expect(dueDateFor('2026-12-15', 15)).toBe('2027-01-15');
    });
  });

  describe('nthCutAfter: cortes de las cuotas siguientes', () => {
    it('recorta el día 31 en febrero', () => {
      expect(nthCutAfter('2026-01-31', 31, 1)).toBe('2026-02-28');
    });

    it('vuelve al día configurado en el mes siguiente (no se queda en 28)', () => {
      expect(nthCutAfter('2026-01-31', 31, 2)).toBe('2026-03-31');
    });
  });
});