import { describe, expect, it } from '@jest/globals';

import type { Alert, CashEvent, MonthSummary, Product } from '@/api/types';
import {
  alertMessage,
  barGeometry,
  chartBars,
  currentMonth,
  incomeShare,
  upcomingIncomes,
  upcomingMovements,
  upcomingPayments,
  visibleMonths,
} from '@/home/summary';

const month = (overrides: Partial<MonthSummary> = {}): MonthSummary => ({
  month: '2026-11',
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

const event = (date: string, amount: number, overrides: Partial<CashEvent> = {}): CashEvent => ({
  date,
  kind: amount < 0 ? 'fixed_expense' : 'income',
  amount,
  label: 'X',
  ...overrides,
});

describe('visibleMonths / currentMonth', () => {
  const months = [
    month({ month: '2026-09' }),
    month({ month: '2026-10' }),
    month({ month: '2026-11' }),
    month({ month: '2026-12' }),
  ];

  it('descarta los meses anteriores al actual', () => {
    expect(visibleMonths(months, '2026-11').map((m) => m.month)).toEqual(['2026-11', '2026-12']);
  });

  it('el mes actual es el primero visible', () => {
    expect(currentMonth(months, '2026-11')?.month).toBe('2026-11');
  });

  it('si la proyección no trae el mes actual, toma el siguiente', () => {
    expect(currentMonth([month({ month: '2026-12' })], '2026-11')?.month).toBe('2026-12');
  });

  it('sin meses desde hoy, no hay mes actual', () => {
    expect(currentMonth(months, '2027-03')).toBeUndefined();
    expect(currentMonth([], '2026-11')).toBeUndefined();
  });

  it('un cambio de año no confunde el orden (YYYY-MM se ordena como texto)', () => {
    const across = [month({ month: '2026-12' }), month({ month: '2027-01' })];
    expect(currentMonth(across, '2026-12')?.month).toBe('2026-12');
    expect(visibleMonths(across, '2027-01').map((m) => m.month)).toEqual(['2027-01']);
  });
});

describe('incomeShare', () => {
  it('es el cierre sobre el ingreso de referencia, en % entero', () => {
    expect(incomeShare({ closingBalance: 170_000_000, referenceIncome: 250_000_000 })).toBe(68);
  });

  it('redondea al entero más cercano', () => {
    expect(incomeShare({ closingBalance: 1, referenceIncome: 3 })).toBe(33);
    expect(incomeShare({ closingBalance: 2, referenceIncome: 3 })).toBe(67);
  });

  it('se acota a 100 si el cierre pasa del ingreso', () => {
    expect(incomeShare({ closingBalance: 500, referenceIncome: 100 })).toBe(100);
  });

  it('se acota a 0 si el cierre es negativo', () => {
    expect(incomeShare({ closingBalance: -500, referenceIncome: 100 })).toBe(0);
  });

  it('sin ingreso de referencia no hay proporción: null', () => {
    expect(incomeShare({ closingBalance: 100, referenceIncome: 0 })).toBeNull();
  });
});

describe('upcomingPayments', () => {
  const today = '2026-11-11';

  it('deja solo salidas, y no ingresos', () => {
    const events = [event('2026-11-15', -100), event('2026-11-30', 500)];
    expect(upcomingPayments(events, today)).toEqual([event('2026-11-15', -100)]);
  });

  it('cuenta hoy pero no ayer', () => {
    const events = [event('2026-11-10', -1), event('2026-11-11', -2)];
    expect(upcomingPayments(events, today).map((e) => e.amount)).toEqual([-2]);
  });

  it('va de la fecha más cercana a la más lejana', () => {
    const events = [event('2026-12-01', -3), event('2026-11-15', -1), event('2026-11-22', -2)];
    expect(upcomingPayments(events, today).map((e) => e.amount)).toEqual([-1, -2, -3]);
  });

  it('devuelve máximo 3', () => {
    const events = [1, 2, 3, 4, 5].map((d) => event(`2026-11-${10 + d}`, -d));
    expect(upcomingPayments(events, today)).toHaveLength(3);
    expect(upcomingPayments(events, today).map((e) => e.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('un movimiento en 0 no es una salida', () => {
    expect(upcomingPayments([event('2026-11-15', 0)], today)).toEqual([]);
  });

  it('no modifica la lista que recibe', () => {
    const events = [event('2026-12-01', -3), event('2026-11-15', -1)];
    upcomingPayments(events, today);
    expect(events.map((e) => e.date)).toEqual(['2026-12-01', '2026-11-15']);
  });
});

describe('upcomingIncomes / upcomingMovements', () => {
  const today = '2026-11-11';

  it('upcomingIncomes trae el próximo ingreso, y solo ingresos', () => {
    const events = [event('2026-11-30', 500), event('2026-11-20', 300), event('2026-11-15', -9)];
    expect(upcomingIncomes(events, today).map((e) => e.amount)).toEqual([300]);
    expect(upcomingIncomes(events, today, 2).map((e) => e.amount)).toEqual([300, 500]);
  });

  it('upcomingMovements junta las 3 próximas salidas y el próximo ingreso, por fecha', () => {
    const events = [
      event('2026-11-30', 4_200_000),
      event('2026-11-15', -1_200_000),
      event('2026-11-22', -410_000),
      event('2026-12-05', -50),
      event('2026-12-09', -60),
    ];
    expect(upcomingMovements(events, today).map((e) => e.date)).toEqual([
      '2026-11-15',
      '2026-11-22',
      '2026-11-30',
      '2026-12-05',
    ]);
  });
});

describe('chartBars', () => {
  it('la altura es relativa al mayor |cierre|', () => {
    const bars = chartBars([
      month({ closingBalance: 200 }),
      month({ closingBalance: 100 }),
      month({ closingBalance: 50 }),
    ]);
    expect(bars.map((b) => b.heightRatio)).toEqual([1, 0.5, 0.25]);
  });

  it('un cierre negativo conserva su signo en value y mide en positivo: la dirección la da el signo', () => {
    const [positive, negative] = chartBars([month({ closingBalance: 200 }), month({ closingBalance: -100 })]);
    expect(negative?.value).toBe(-100);
    expect(negative?.heightRatio).toBe(0.5);
    expect(positive?.value).toBe(200);
  });

  it('el mayor puede ser un negativo: ese mide 1', () => {
    const bars = chartBars([month({ closingBalance: -400 }), month({ closingBalance: 100 })]);
    expect(bars.map((b) => b.heightRatio)).toEqual([1, 0.25]);
  });

  it('si todos los cierres son 0, ninguna barra crece (sin dividir entre 0)', () => {
    expect(chartBars([month(), month()]).map((b) => b.heightRatio)).toEqual([0, 0]);
  });

  it('lleva el mes y el semáforo de cada barra', () => {
    const [bar] = chartBars([month({ month: '2026-12', light: 'yellow', closingBalance: 10 })]);
    expect(bar).toMatchObject({ month: '2026-12', light: 'yellow', value: 10 });
  });

  it('sin meses, sin barras', () => {
    expect(chartBars([])).toEqual([]);
  });
});

describe('barGeometry', () => {
  it('pasa las proporciones a píxeles', () => {
    const bars = chartBars([month({ closingBalance: 200 }), month({ closingBalance: 100 })]);
    const { shapes, up, down } = barGeometry(bars, 100, 4);
    expect(shapes).toEqual([
      { height: 100, below: false },
      { height: 50, below: false },
    ]);
    expect(up).toBe(100);
    expect(down).toBe(0);
  });

  it('sin meses negativos no reserva espacio debajo de la línea base', () => {
    expect(barGeometry(chartBars([month({ closingBalance: 5 })]), 100, 4).down).toBe(0);
  });

  it('un mes negativo cuelga de la línea base y reserva espacio debajo', () => {
    const bars = chartBars([month({ closingBalance: 200 }), month({ closingBalance: -100 })]);
    const { shapes, up, down } = barGeometry(bars, 100, 4);
    expect(shapes[1]).toEqual({ height: 50, below: true });
    expect(up).toBe(100);
    expect(down).toBe(50);
  });

  it('con todos negativos, no queda espacio encima de la línea base', () => {
    const { up, down } = barGeometry(chartBars([month({ closingBalance: -100 })]), 100, 4);
    expect(up).toBe(0);
    expect(down).toBe(100);
  });

  it('una barra diminuta, o de 0, no baja del mínimo', () => {
    const bars = chartBars([
      month({ closingBalance: 1_000_000 }),
      month({ closingBalance: 1 }),
      month({ closingBalance: 0 }),
    ]);
    expect(barGeometry(bars, 100, 4).shapes.map((s) => s.height)).toEqual([100, 4, 4]);
  });
});

describe('alertMessage', () => {
  const products: Product[] = [
    { id: 7, kind: 'credit_card', name: 'Visa Ficticia', bank: 'Banco Ejemplo', last4: '4321' },
  ];

  it('una tarjeta con su nombre, el % de uso y el umbral', () => {
    const alert: Alert = { kind: 'card_utilization', refId: '7', value: '0.4716', threshold: '0.30' };
    expect(alertMessage(alert, products)).toBe(
      'Visa Ficticia ····4321 usa el 47 % del cupo. Pasar del 30 % afecta tu historial.',
    );
  });

  it('si la tarjeta no está en la lista, no inventa un nombre', () => {
    const alert: Alert = { kind: 'card_utilization', refId: '99', value: '0.5', threshold: '0.3' };
    expect(alertMessage(alert, products)).toMatch(/^Una de tus tarjetas usa el 50 % del cupo/);
  });

  it('la deuda sobre el ingreso nombra el mes', () => {
    const alert: Alert = { kind: 'debt_to_income', refId: '2026-12', value: '0.42', threshold: '0.40' };
    expect(alertMessage(alert, products)).toMatch(/^En diciembre tus pagos.*42 %.*40 %/);
  });
});
