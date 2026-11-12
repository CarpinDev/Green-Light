import { openingDebtDate } from './opening-debt-date';

describe('openingDebtDate', () => {
  describe('Nu (corte 14, pago 4)', () => {
    it.each([
      ['12 nov: el último corte (14 oct) ya se pagó el 4 nov', '2026-11-12', '2026-11-12'],
      ['14 nov: el día del corte, el extracto que se está cerrando', '2026-11-14', '2026-11-14'],
      ['20 nov: el extracto del 14 nov se paga el 4 dic', '2026-11-20', '2026-11-14'],
      ['5 dic: ya venció el pago del 4 dic', '2026-12-05', '2026-12-05'],
    ])('%s', (_name, today, expected) => {
      expect(openingDebtDate(today, 14, 4)).toBe(expected);
    });

    it('20 nov con el extracto ya pagado: hoy', () => {
      expect(openingDebtDate('2026-11-20', 14, 4, true)).toBe('2026-11-20');
    });
  });

  describe('Rappi (corte 20, pago 2)', () => {
    it('12 nov: hoy', () => expect(openingDebtDate('2026-11-12', 20, 2)).toBe('2026-11-12'));
    it('25 oct: el corte del 20 oct se paga el 2 nov', () => {
      expect(openingDebtDate('2026-10-25', 20, 2)).toBe('2026-10-20');
    });
  });

  it('pago el mismo día del hoy: todavía cuenta como pendiente', () => {
    expect(openingDebtDate('2026-12-04', 14, 4)).toBe('2026-11-14');
  });

  it('cruza el año: 3 ene con corte 14 y pago 4 (el corte fue el 14 dic)', () => {
    expect(openingDebtDate('2027-01-03', 14, 4)).toBe('2026-12-14');
  });

  it('un mes con menos días que el corte (31): febrero cierra el 28', () => {
    // 2 mar: el último corte fue el 28 feb (clamp), su pago es el 10 mar
    expect(openingDebtDate('2027-03-02', 31, 10)).toBe('2027-02-28');
    // 28 feb: el corte de ese mes es hoy mismo
    expect(openingDebtDate('2027-02-28', 31, 10)).toBe('2027-02-28');
  });
});
