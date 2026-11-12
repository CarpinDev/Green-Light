import { describe, expect, it } from '@jest/globals';

import type { Movement } from '@/api/types';
import { upcomingEvents } from '@/home/summary';
import { dayTitle, groupByDay, movementLabel, movementTags, signedAmount, sourceText } from '@/movements/logic';

const movement = (overrides: Partial<Movement> = {}): Movement => ({
  id: 'expense:1',
  type: 'expense',
  direction: 'out',
  date: '2026-11-12',
  amountCents: 12_000_000,
  description: '',
  categoryName: null,
  product: null,
  installments: null,
  isOpeningDebt: false,
  sourceLabel: null,
  scheduled: false,
  ...overrides,
});

const VISA = { id: 1, name: 'Visa', last4: '1234', kind: 'credit_card' as const };
const AHORROS = { id: 2, name: 'Ahorros', last4: '5678', kind: 'account' as const };

describe('sourceText', () => {
  it('un abono dice de dónde salió el dinero', () => {
    const abono = { type: 'capital_payment' as const, product: VISA };
    expect(sourceText(movement({ ...abono, sourceLabel: 'desde Ahorros ••1357' }))).toBe(
      'Tarjeta Visa ••1234 · desde Ahorros ••1357',
    );
    expect(sourceText(movement({ ...abono, sourceLabel: 'externo' }))).toBe('Tarjeta Visa ••1234 · externo');
    expect(sourceText(movement({ ...abono, sourceLabel: null }))).toBe('Tarjeta Visa ••1234');
  });
  it('una tarjeta con cuotas: "Tarjeta Visa ••1234 · 3 cuotas"', () => {
    expect(sourceText(movement({ product: VISA, installments: 3 }))).toBe('Tarjeta Visa ••1234 · 3 cuotas');
  });

  it('una sola cuota va en singular', () => {
    expect(sourceText(movement({ product: VISA, installments: 1 }))).toBe('Tarjeta Visa ••1234 · 1 cuota');
  });

  it('una cuenta: "Ahorros ••5678"', () => {
    expect(sourceText(movement({ product: AHORROS }))).toBe('Ahorros ••5678');
  });

  it('un préstamo lleva su prefijo', () => {
    const loan = { id: 3, name: 'Libre inversión', last4: '9999', kind: 'loan' as const };
    expect(sourceText(movement({ product: loan, type: 'capital_payment' }))).toBe('Préstamo Libre inversión ••9999');
  });

  it('sin producto: "Sin cuenta"', () => {
    expect(sourceText(movement({ direction: 'in', product: null }))).toBe('Sin cuenta');
    expect(sourceText(movement({ product: null }))).toBe('Sin cuenta');
  });

  it('un gasto fijo programado sin tarjeta sale del saldo: "Del saldo"', () => {
    expect(sourceText(movement({ scheduled: true, product: null }))).toBe('Del saldo');
  });
});

describe('signedAmount', () => {
  it('una entrada lleva +, una salida lleva − (el signo menos de verdad)', () => {
    expect(signedAmount({ direction: 'in', amountCents: 50_000_000 })).toMatch(/^\+ \$\s?500\.000$/);
    expect(signedAmount({ direction: 'out', amountCents: 12_000_000 })).toMatch(/^− \$\s?120\.000$/);
  });

  it('el monto va siempre en positivo: el signo lo pone la dirección', () => {
    expect(signedAmount({ direction: 'out', amountCents: 100 })).not.toContain('-');
  });
});

describe('movementLabel', () => {
  it('la descripción si la hay', () => {
    expect(movementLabel({ type: 'expense', description: 'Mercado' })).toBe('Mercado');
  });

  it('sin descripción, el tipo: Gasto, Ingreso o Abono', () => {
    expect(movementLabel({ type: 'expense', description: '' })).toBe('Gasto');
    expect(movementLabel({ type: 'income', description: '  ' })).toBe('Ingreso');
    expect(movementLabel({ type: 'capital_payment', description: '' })).toBe('Abono');
  });
});

describe('movementTags', () => {
  it('programado y deuda inicial; ninguna si no aplica', () => {
    expect(movementTags({ scheduled: true, isOpeningDebt: false })).toEqual(['programado']);
    expect(movementTags({ scheduled: false, isOpeningDebt: true })).toEqual(['deuda inicial']);
    expect(movementTags({ scheduled: false, isOpeningDebt: false })).toEqual([]);
  });
});

describe('dayTitle y groupByDay', () => {
  const TODAY = '2026-11-12';

  it('Hoy, Ayer y Mañana; el resto, la fecha corta', () => {
    expect(dayTitle('2026-11-12', TODAY)).toBe('Hoy');
    expect(dayTitle('2026-11-11', TODAY)).toBe('Ayer');
    expect(dayTitle('2026-11-13', TODAY)).toBe('Mañana');
    expect(dayTitle('2026-11-05', TODAY)).toBe('5 nov');
  });

  it('ayer y mañana cruzan el cambio de mes y de año', () => {
    expect(dayTitle('2026-10-31', '2026-11-01')).toBe('Ayer');
    expect(dayTitle('2026-12-01', '2026-11-30')).toBe('Mañana');
    expect(dayTitle('2025-12-31', '2026-01-01')).toBe('Ayer');
    expect(dayTitle('2027-01-01', '2026-12-31')).toBe('Mañana');
  });

  it('agrupa lo del mismo día sin cambiar el orden', () => {
    const groups = groupByDay(
      [
        movement({ id: 'a', date: '2026-11-12' }),
        movement({ id: 'b', date: '2026-11-12' }),
        movement({ id: 'c', date: '2026-11-11' }),
        movement({ id: 'd', date: '2026-11-05' }),
      ],
      TODAY,
    );
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ['Hoy', ['a', 'b']],
      ['Ayer', ['c']],
      ['5 nov', ['d']],
    ]);
  });

  it('sin movimientos, ningún grupo', () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});

describe('upcomingEvents', () => {
  const event = (date: string, amount: number, label = 'x') => ({
    date,
    kind: 'expense' as const,
    amount,
    label,
  });
  const month = (m: string, events: ReturnType<typeof event>[]) => ({
    month: m,
    openingBalance: 0,
    income: 0,
    outflow: 0,
    closingBalance: 0,
    lowestBalance: 0,
    referenceIncome: 0,
    light: 'green' as const,
    events,
  });

  it('desde mañana, del mes actual y el siguiente, por fecha: lo de hoy ya es de Recientes', () => {
    const months = [
      month('2026-10', [event('2026-10-30', -1)]),
      month('2026-11', [event('2026-11-20', -3), event('2026-11-05', -9), event('2026-11-12', -2)]),
      month('2026-12', [event('2026-12-01', -4)]),
      month('2027-01', [event('2027-01-10', -5)]),
    ];
    expect(upcomingEvents(months, '2026-11', '2026-11-12').map((e) => e.date)).toEqual(['2026-11-20', '2026-12-01']);
  });

  it('la división es limpia: hoy ya no entra y mañana sí', () => {
    const months = [month('2026-11', [event('2026-11-12', -1), event('2026-11-13', -2)])];
    expect(upcomingEvents(months, '2026-11', '2026-11-12').map((e) => e.date)).toEqual(['2026-11-13']);
  });

  it('sin eventos futuros, una lista vacía', () => {
    expect(upcomingEvents([month('2026-11', [event('2026-11-01', -1)])], '2026-11', '2026-11-12')).toEqual([]);
  });
});
