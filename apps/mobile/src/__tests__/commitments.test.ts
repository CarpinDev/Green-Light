import { describe, expect, it } from '@jest/globals';

import type { CashEvent, MonthSummary } from '@/api/types';
import { monthCommitments, remainingLight } from '@/home/commitments';
import { eventTitle, upcomingByMonth } from '@/home/summary';

// Hoy es 1 de noviembre. Nu: corte el 14 y pago el 4. Rappi: corte el 20 y pago el 2. Datos ficticios.
const TODAY = '2026-11-01';
const NU = '1';
const RAPPI = '2';
const cards = [
  { id: 1, name: 'Nu', last4: '4174' },
  { id: 2, name: 'Rappi', last4: '9999' },
];

const month = (m: string, overrides: Partial<MonthSummary> = {}): MonthSummary => ({
  month: m,
  openingBalance: 0,
  income: 0,
  outflow: 0,
  closingBalance: 0,
  lowestBalance: 0,
  referenceIncome: 0,
  light: 'green',
  events: [],
  ...overrides,
});

const card = (refId: string, cutDate: string, date: string, minimum: number, fullPayment = minimum * 3): CashEvent => ({
  date,
  kind: 'card_payment',
  amount: -minimum,
  label: `Pago mínimo tarjeta (corte ${cutDate})`,
  refId,
  cutDate,
  fullPayment,
});
const fixed = (date: string, amount: number, label = 'Arriendo'): CashEvent => ({
  date,
  kind: 'fixed_expense',
  amount: -amount,
  label,
  refId: '9',
});
const loan = (date: string, amount: number): CashEvent => ({
  date,
  kind: 'loan_payment',
  amount: -amount,
  label: 'Cuota 3 préstamo',
  refId: '3',
});

describe('monthCommitments', () => {
  it('Nu con corte el 14 nov y pago el 4 dic cuenta en noviembre; el restante real = cierre de nov − ese mínimo', () => {
    const months = [
      month('2026-11', { closingBalance: 5_000_000, events: [] }),
      month('2026-12', { events: [card(NU, '2026-11-14', '2026-12-04', 1_083_568)] }),
    ];
    const result = monthCommitments(months, '2026-11', TODAY, cards);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: 'card_payment',
      label: 'Nu ····4174',
      cutDate: '2026-11-14',
      dueDate: '2026-12-04',
      amount: 1_083_568,
      fullPayment: 3_250_704,
    });
    expect(result.totalCents).toBe(1_083_568);
    expect(result.realRemainingCents).toBe(5_000_000 - 1_083_568);
  });

  it('una tarjeta con corte en octubre que vence en noviembre (después de hoy) cuenta, sin restarse dos veces', () => {
    // Rappi cortó el 20 oct y vence el 2 nov: ya está dentro del cierre de noviembre
    const months = [
      month('2026-11', { closingBalance: 5_000_000, events: [card(RAPPI, '2026-10-20', '2026-11-02', 400_000)] }),
    ];
    const result = monthCommitments(months, '2026-11', TODAY, cards);

    expect(result.items.map((c) => [c.label, c.amount])).toEqual([['Rappi ····9999', 400_000]]);
    expect(result.totalCents).toBe(400_000);
    expect(result.realRemainingCents).toBe(5_000_000); // el cierre ya lo trae descontado
  });

  it('un gasto fijo de este mes con fecha ≤ hoy no aparece; el que viene sí, por su fecha de pago', () => {
    const months = [
      month('2026-11', {
        closingBalance: 1_000_000,
        events: [fixed('2026-11-01', 900_000, 'Luz'), fixed('2026-11-15', 1_200_000), loan('2026-11-10', 500_000)],
      }),
    ];
    const result = monthCommitments(months, '2026-11', TODAY, cards);

    expect(result.items.map((c) => [c.kind, c.label, c.dueDate])).toEqual([
      ['loan_payment', 'Cuota 3 préstamo', '2026-11-10'],
      ['fixed_expense', 'Arriendo', '2026-11-15'],
    ]);
    expect(result.totalCents).toBe(1_700_000);
    // Fijos y préstamos salen dentro del mes: ya están en el cierre
    expect(result.realRemainingCents).toBe(1_000_000);
  });

  it('el corte del mes siguiente no cuenta todavía', () => {
    const months = [
      month('2026-11', { closingBalance: 100 }),
      month('2026-12', { events: [card(NU, '2026-12-14', '2027-01-04', 900_000)] }),
    ];
    expect(monthCommitments(months, '2026-11', TODAY, cards).items).toEqual([]);
  });

  it('sin compromisos, el restante real es igual al cierre del mes', () => {
    const result = monthCommitments([month('2026-11', { closingBalance: 777_000 })], '2026-11', TODAY, cards);
    expect(result).toEqual({ items: [], totalCents: 0, realRemainingCents: 777_000 });
  });

  it('estimated es true si el corte es después de hoy', () => {
    const months = [
      month('2026-11', {
        events: [card(NU, '2026-11-14', '2026-12-04', 1), card(RAPPI, '2026-10-20', '2026-11-02', 1)],
      }),
    ];
    const [rappi, nu] = monthCommitments(months, '2026-11', TODAY, cards).items;
    expect(rappi).toMatchObject({ label: 'Rappi ····9999', estimated: false });
    expect(nu).toMatchObject({ label: 'Nu ····4174', estimated: true });
    // El día del corte ya no es estimado
    const sameDay = monthCommitments(months, '2026-11', '2026-11-14', cards).items.find((c) => c.refId === NU);
    expect(sameDay?.estimated).toBe(false);
  });

  it('sin la tarjeta en la consulta, se llama "Tarjeta"', () => {
    const months = [month('2026-11', { events: [card('77', '2026-11-14', '2026-12-04', 1)] })];
    expect(monthCommitments(months, '2026-11', TODAY, []).items[0]?.label).toBe('Tarjeta');
  });

  it('ignora lo que no es un compromiso (ingresos, gastos sueltos, abonos)', () => {
    const months = [
      month('2026-11', {
        events: [
          { date: '2026-11-25', kind: 'income', amount: 2_700_000, label: 'Salario' },
          { date: '2026-11-10', kind: 'expense', amount: -50_000, label: 'Mercado' },
          { date: '2026-11-12', kind: 'capital_payment', amount: -500_000, label: 'Abono' },
        ],
      }),
    ];
    expect(monthCommitments(months, '2026-11', TODAY, cards).items).toEqual([]);
  });

  it('un pago de tarjeta sin cutDate (un servidor viejo) no se cuenta por corte', () => {
    const old: CashEvent = { date: '2026-12-04', kind: 'card_payment', amount: -100, label: 'x', refId: NU };
    expect(monthCommitments([month('2026-11', { events: [old] })], '2026-11', TODAY, cards).items).toEqual([]);
  });
});

describe('remainingLight', () => {
  const m = { lowestBalance: 100, referenceIncome: 10_000_000 };

  it('rojo si es negativo', () => {
    expect(remainingLight(-1, m, '0.10')).toBe('red');
  });

  it('amarillo si queda menos que el umbral del ingreso de referencia, o si el mes tocó negativo', () => {
    expect(remainingLight(999_999, m, '0.10')).toBe('yellow');
    expect(remainingLight(5_000_000, { ...m, lowestBalance: -1 }, '0.10')).toBe('yellow');
  });

  it('verde si queda igual o más que el umbral', () => {
    expect(remainingLight(1_000_000, m, '0.10')).toBe('green');
  });

  it('sin el umbral solo hay rojo, amarillo por el punto más bajo y verde', () => {
    expect(remainingLight(1, m, null)).toBe('green');
    expect(remainingLight(0, m, null)).toBe('green');
    expect(remainingLight(1, { ...m, lowestBalance: -5 }, null)).toBe('yellow');
  });
});

describe('upcomingByMonth y eventTitle', () => {
  const months = [
    month('2026-10', { events: [fixed('2026-10-20', 1)] }),
    month('2026-11', {
      events: [
        fixed('2026-11-01', 5), // hoy: ya pasó
        fixed('2026-11-15', 1_200_000),
        { date: '2026-11-25', kind: 'income', amount: 2_700_000, label: 'Salario' },
      ],
    }),
    month('2026-12', { events: [card(NU, '2026-11-14', '2026-12-04', 612_601)] }),
    month('2027-01', {}),
  ];

  it('agrupa por mes desde el actual, sin lo de hoy ni lo anterior, con lo que entra y lo que sale', () => {
    const groups = upcomingByMonth(months, '2026-11', TODAY);

    expect(groups.map((g) => g.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(groups[0]?.events.map((e) => e.date)).toEqual(['2026-11-15', '2026-11-25']);
    expect(groups[0]).toMatchObject({ income: 2_700_000, outflow: 1_200_000 });
    expect(groups[1]).toMatchObject({ income: 0, outflow: 612_601 });
    expect(groups[2]).toMatchObject({ events: [], income: 0, outflow: 0 });
  });

  it('usa los 6 meses, no solo 2', () => {
    const six = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map((m) => month(m));
    expect(upcomingByMonth(six, '2026-11', TODAY)).toHaveLength(6);
  });

  it('el título de un pago de tarjeta no lleva la fecha ISO; los demás, su texto', () => {
    expect(eventTitle(card(NU, '2026-11-14', '2026-12-04', 1))).toBe('Pago mínimo tarjeta');
    expect(eventTitle(fixed('2026-11-15', 1))).toBe('Arriendo');
    expect(eventTitle({ kind: 'card_payment', label: 'Pago (corte 2026-11-14)' })).toBe('Pago (corte 2026-11-14)');
  });
});
