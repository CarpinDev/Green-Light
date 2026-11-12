import { describe, expect, it } from '@jest/globals';

import {
  debtTotal,
  type DebtGroupDraft,
  emptyGroup,
  groupBody,
  groupsFromApi,
  openingDebtBody,
  validateGroup,
  validateGroups,
} from '@/products/debt';
import { barHeights, checkVerdict, comparableCut, planBars } from '@/products/plan';

const group = (overrides: Partial<DebtGroupDraft> = {}): DebtGroupDraft => ({
  ...emptyGroup('g'),
  amountCents: 190_000_000,
  installments: '2',
  ...overrides,
});

describe('debtTotal', () => {
  it('suma los capitales de todos los grupos', () => {
    const groups = [
      group({ amountCents: 190_000_000 }),
      group({ amountCents: 120_000_000 }),
      group({ amountCents: 83_000_000 }),
    ];
    expect(debtTotal(groups)).toBe(393_000_000);
  });

  it('un grupo sin monto todavía cuenta 0, y sin grupos la suma es 0', () => {
    expect(debtTotal([group({ amountCents: 100 }), group({ amountCents: null })])).toBe(100);
    expect(debtTotal([])).toBe(0);
  });
});

describe('validateGroup', () => {
  it('un grupo completo no tiene error', () => {
    expect(validateGroup(group())).toBeNull();
  });

  it('el monto debe ser mayor que 0', () => {
    expect(validateGroup(group({ amountCents: null }))).toMatch(/cuánto/);
    expect(validateGroup(group({ amountCents: 0 }))).toMatch(/cuánto/);
  });

  it('las cuotas van de 1 a 72', () => {
    for (const installments of ['', '0', '73', 'a', '1,5', '-2']) {
      expect(validateGroup(group({ installments }))).toMatch(/1 a 72/);
    }
    expect(validateGroup(group({ installments: '72' }))).toBeNull();
    expect(validateGroup(group({ installments: '1' }))).toBeNull();
  });

  it('con promoción pide una tasa válida; 0 sí vale; sin promoción no la mira', () => {
    expect(validateGroup(group({ hasPromo: true, promoPercent: '' }))).toMatch(/tasa/);
    expect(validateGroup(group({ hasPromo: true, promoPercent: 'abc' }))).toMatch(/tasa/);
    expect(validateGroup(group({ hasPromo: true, promoPercent: '100' }))).toMatch(/tasa/);
    expect(validateGroup(group({ hasPromo: true, promoPercent: '0' }))).toBeNull();
    expect(validateGroup(group({ hasPromo: false, promoPercent: 'abc' }))).toBeNull();
  });
});

describe('validateGroups', () => {
  it('pide al menos un grupo y dice cuál falla', () => {
    expect(validateGroups([])).toMatch(/al menos un grupo/);
    expect(validateGroups([group(), group({ installments: '0' })])).toMatch(/^Grupo 2:/);
    expect(validateGroups([group(), group()])).toBeNull();
  });

  it('el máximo es 30 grupos', () => {
    expect(validateGroups(Array.from({ length: 30 }, () => group()))).toBeNull();
    expect(validateGroups(Array.from({ length: 31 }, () => group()))).toMatch(/máximo/);
  });
});

describe('groupBody y openingDebtBody', () => {
  it('sin promoción: solo monto y cuotas', () => {
    expect(groupBody(group())).toEqual({ amountCents: 190_000_000, installments: 2 });
  });

  it('con promoción: la tasa va como texto exacto, E.A. o M.V.', () => {
    expect(groupBody(group({ hasPromo: true, promoPercent: '0' }))).toEqual({
      amountCents: 190_000_000,
      installments: 2,
      promo: { ea: '0' },
    });
    expect(groupBody(group({ hasPromo: true, promoPercent: '1,8', promoKind: 'mv' }))).toEqual({
      amountCents: 190_000_000,
      installments: 2,
      promo: { mv: '0.018' },
    });
  });

  it('un grupo inválido no tiene cuerpo', () => {
    expect(groupBody(group({ amountCents: null }))).toBeNull();
    expect(groupBody(group({ hasPromo: true, promoPercent: 'x' }))).toBeNull();
  });

  it('el cuerpo de todos los grupos; null si alguno no vale', () => {
    const promo = group({ amountCents: 83_000_000, installments: '12', hasPromo: true, promoPercent: '0' });
    expect(openingDebtBody([group(), promo])).toEqual({
      items: [
        { amountCents: 190_000_000, installments: 2 },
        { amountCents: 83_000_000, installments: 12, promo: { ea: '0' } },
      ],
    });
    expect(openingDebtBody([group(), group({ installments: '99' })])).toBeNull();
    expect(openingDebtBody([])).toBeNull();
  });
});

describe('groupsFromApi', () => {
  it('precarga los grupos guardados; la promoción vuelve como porcentaje E.A.', () => {
    const drafts = groupsFromApi([
      { id: 1, amountCents: 190_000_000, installments: 2, promo: null },
      { id: 2, amountCents: 83_000_000, installments: 12, promo: { ea: '0.018', mv: '0.0015', description: '' } },
    ]);
    expect(drafts[0]).toMatchObject({ amountCents: 190_000_000, installments: '2', hasPromo: false });
    expect(drafts[1]).toMatchObject({ installments: '12', hasPromo: true, promoPercent: '1,8', promoKind: 'ea' });
    // Lo que se precarga se puede volver a enviar tal cual
    expect(openingDebtBody(drafts)).not.toBeNull();
  });
});

const cut = (cutDate: string, dueDate: string, total: number) => ({
  cutDate,
  dueDate,
  minimum: { capital: total, interest: 0, fees: 0, total },
  fullPayment: { capital: total, interest: 0, fees: 0, total },
  remainingDebtCents: 0,
});

describe('planBars y barHeights', () => {
  const cuts = [
    cut('2026-11-22', '2026-12-04', 100),
    cut('2026-12-22', '2027-01-04', 50),
    cut('2027-01-22', '2027-02-04', 0),
  ];

  it('una barra por corte, con el mes del pago; la primera es el próximo', () => {
    const bars = planBars(cuts);
    expect(bars.map((b) => [b.month, b.value, b.highlighted])).toEqual([
      ['2026-12', 100, true],
      ['2027-01', 50, false],
      ['2027-02', 0, false],
    ]);
  });

  it('el alto es proporcional al mínimo; el mayor mide el máximo y uno de 0 no se dibuja', () => {
    expect(barHeights([100, 50, 0], 120, 4)).toEqual([120, 60, 0]);
  });

  it('un valor pequeño no baja del mínimo visible', () => {
    expect(barHeights([1_000_000, 1], 120, 4)).toEqual([120, 4]);
  });

  it('sin valores o todos en 0, nada se dibuja', () => {
    expect(barHeights([], 120, 4)).toEqual([]);
    expect(barHeights([0, 0], 120, 4)).toEqual([0, 0]);
  });
});

describe('comparableCut', () => {
  const cuts = [cut('2026-11-22', '2026-12-04', 1), cut('2026-12-22', '2027-01-04', 1)];

  it('el primer corte, si ya cerró (su extracto existe)', () => {
    expect(comparableCut(cuts, '2026-11-25')?.cutDate).toBe('2026-11-22');
    expect(comparableCut(cuts, '2026-11-22')?.cutDate).toBe('2026-11-22');
  });

  it('si el primer corte todavía no llega, no hay nada que comparar', () => {
    expect(comparableCut(cuts, '2026-11-21')).toBeNull();
    expect(comparableCut([], '2026-11-25')).toBeNull();
  });
});

describe('checkVerdict', () => {
  const check = (overrides: Partial<{ difference: number; relativeDifference: string; withinTolerance: boolean }>) => ({
    calculatedMinimum: 100,
    bankMinimum: 100,
    difference: 0,
    relativeDifference: '0',
    withinTolerance: true,
    ...overrides,
  });

  it('dentro de la tolerancia: coincide', () => {
    const verdict = checkVerdict(check({ difference: 50, relativeDifference: '0.0123', withinTolerance: true }));
    expect(verdict.within).toBe(true);
    expect(verdict.headline).toContain('1,23 %');
    expect(verdict.headline).toContain('dentro');
  });

  it('fuera: dice quién calcula más y qué revisar', () => {
    const more = checkVerdict(check({ difference: 5_000, relativeDifference: '0.0456', withinTolerance: false }));
    expect(more.within).toBe(false);
    expect(more.headline).toContain('4,56 %');
    expect(more.headline).toContain('calcula más');
    expect(more.advice).toBe('Si la diferencia es grande, revisa los grupos de tu deuda inicial o la tasa.');

    const less = checkVerdict(check({ difference: -5_000, relativeDifference: '0.0456', withinTolerance: false }));
    expect(less.headline).toContain('calcula menos');
  });

  it('si el banco dice 0 la diferencia es infinita: no inventa un porcentaje', () => {
    const verdict = checkVerdict(check({ difference: 100, relativeDifference: 'Infinity', withinTolerance: false }));
    expect(verdict.headline).toContain('sin porcentaje');
  });
});
