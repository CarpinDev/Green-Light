import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { pesos } from '../src/money';
import { endOfMonth } from '../src/calendar';
import {
  type CashEvent,
  type ProjectionInput,
  classify,
  monthlyDates,
  project,
  sortEvents,
} from '../src/projection';

const TEN_PCT = new Decimal('0.10');

const event = (overrides: Partial<CashEvent>): CashEvent => ({
  date: '2026-03-01',
  kind: 'expense',
  amount: 0,
  label: '',
  refId: 'e',
  ...overrides,
});

describe('endOfMonth (calendar)', () => {
  it('último día del mes, incluido febrero bisiesto', () => {
    expect(endOfMonth('2026-03-10')).toBe('2026-03-31');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-01')).toBe('2028-02-29');
  });
});

describe('monthlyDates: ocurrencias de algo mensual en un rango', () => {
  it('una por mes en el día indicado, dentro del rango [from, to]', () => {
    expect(monthlyDates(15, '2026-01-01', undefined, '2026-03-01', '2026-05-31')).toEqual([
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
    ]);
  });

  it('el día 30 en febrero usa el último día', () => {
    expect(monthlyDates(30, '2026-01-01', undefined, '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-30']);
  });

  it('respeta la vigencia: nada antes de start ni después de end', () => {
    expect(monthlyDates(10, '2026-04-01', '2026-05-31', '2026-03-01', '2026-07-31')).toEqual([
      '2026-04-10',
      '2026-05-10',
    ]);
  });
});

describe('sortEvents', () => {
  it('ordena por fecha y, el mismo día, los ingresos primero', () => {
    const sorted = sortEvents([
      event({ date: '2026-04-01', amount: -100, refId: 'rent' }),
      event({ date: '2026-03-30', amount: -50, refId: 'x' }),
      event({ date: '2026-04-01', kind: 'income', amount: 300, refId: 'salary' }),
    ]);
    expect(sorted.map((e) => e.refId)).toEqual(['x', 'salary', 'rent']);
  });

  it('no modifica el arreglo original', () => {
    const original = [event({ date: '2026-04-02', refId: 'b' }), event({ date: '2026-04-01', refId: 'a' })];
    sortEvents(original);
    expect(original[0]?.refId).toBe('b');
  });
});

describe('classify: semáforo', () => {
  it('rojo si el mes cierra en negativo', () => {
    expect(classify(-1, -1, pesos(3_000_000), TEN_PCT)).toBe('red');
  });

  it('amarillo si cierra en positivo pero el saldo pasó por negativo', () => {
    expect(classify(pesos(2_000_000), pesos(-100_000), pesos(3_000_000), TEN_PCT)).toBe('yellow');
  });

  it('amarillo si cierra con menos del 10 % del ingreso del mes', () => {
    expect(classify(pesos(299_999), pesos(100_000), pesos(3_000_000), TEN_PCT)).toBe('yellow');
  });

  it('verde con el 10 % justo o más', () => {
    expect(classify(pesos(300_000), pesos(100_000), pesos(3_000_000), TEN_PCT)).toBe('green');
  });
});

describe('project: disponible mes a mes', () => {
  // Hoy es 10 de marzo y tengo 1.000.000. Salario de 3.000.000 el 30, arriendo de 1.200.000 el 1,
  // Netflix con tarjeta (no sale del disponible), un gasto del 12 de marzo, una prima en abril
  // y una cuota de préstamo que llega como evento externo el 20 de marzo.
  const input: ProjectionInput = {
    asOf: '2026-03-10',
    openingBalance: pesos(1_000_000),
    recurringIncomes: [{ id: 'salary', name: 'Salario', amount: pesos(3_000_000), day: 30, start: '2026-01-01' }],
    oneOffIncomes: [{ id: 'bonus', date: '2026-04-20', amount: pesos(500_000), description: 'Prima' }],
    fixedExpenses: [
      { id: 'rent', name: 'Arriendo', amount: pesos(1_200_000), day: 1, start: '2026-01-01' },
      { id: 'netflix', name: 'Netflix', amount: pesos(40_000), day: 15, start: '2026-01-01', cardId: 'card-1' },
    ],
    cashExpenses: [
      { id: 'old', date: '2026-03-05', amount: pesos(999_999), description: 'Ya está en el saldo' },
      { id: 'market', date: '2026-03-12', amount: pesos(200_000), description: 'Mercado' },
    ],
    extraEvents: [
      { date: '2026-03-20', kind: 'loan_payment', amount: -pesos(900_000), label: 'Cuota préstamo', refId: 'loan-1' },
    ],
    yellowBelowIncomePct: TEN_PCT,
  };
  const [mar, apr, may] = project(input, 3);

  it('proyecta el mes actual y los siguientes', () => {
    expect([mar?.month, apr?.month, may?.month]).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('solo cuenta lo posterior a la fecha del saldo', () => {
    expect(mar?.events.map((e) => e.refId)).toEqual(['market', 'loan-1', 'salary']);
  });

  it('marzo cierra en 2.900.000 pero baja a −100.000 el 20 antes del salario: amarillo', () => {
    expect(mar?.openingBalance).toBe(pesos(1_000_000));
    expect(mar?.closingBalance).toBe(pesos(2_900_000));
    expect(mar?.lowestBalance).toBe(pesos(-100_000));
    expect(mar?.lowestBalanceDate).toBe('2026-03-20');
    expect(mar?.light).toBe('yellow');
  });

  it('abril arranca donde cerró marzo y suma ingresos y salidas', () => {
    expect(apr?.openingBalance).toBe(pesos(2_900_000));
    expect(apr?.income).toBe(pesos(3_500_000));
    expect(apr?.outflow).toBe(pesos(1_200_000));
    expect(apr?.closingBalance).toBe(pesos(5_200_000));
  });

  it('el ingreso de referencia es todo el ingreso del mes', () => {
    expect(mar?.referenceIncome).toBe(pesos(3_000_000));
    expect(apr?.referenceIncome).toBe(pesos(3_500_000));
  });

  it('abril es verde y su punto más bajo es el día del arriendo', () => {
    expect(apr?.lowestBalance).toBe(pesos(1_700_000));
    expect(apr?.lowestBalanceDate).toBe('2026-04-01');
    expect(apr?.light).toBe('green');
  });

  it('los gastos fijos con tarjeta no salen del disponible aquí', () => {
    expect(apr?.events.some((e) => e.refId === 'netflix')).toBe(false);
  });

  describe('casos borde', () => {
    it('un mes sin eventos: el punto más bajo es el saldo inicial y no tiene fecha', () => {
      const [only] = project({ asOf: '2026-03-10', openingBalance: pesos(500_000), yellowBelowIncomePct: TEN_PCT }, 1);
      expect(only?.lowestBalance).toBe(pesos(500_000));
      expect(only?.lowestBalanceDate).toBeUndefined();
      expect(only?.closingBalance).toBe(pesos(500_000));
    });

    it('sin salario y con arriendo: rojo', () => {
      const [, next] = project(
        {
          asOf: '2026-03-10',
          openingBalance: pesos(1_000_000),
          fixedExpenses: [{ id: 'rent', name: 'Arriendo', amount: pesos(1_200_000), day: 1, start: '2026-01-01' }],
          yellowBelowIncomePct: TEN_PCT,
        },
        2,
      );
      expect(next?.closingBalance).toBe(pesos(-200_000));
      expect(next?.light).toBe('red');
    });

    it('salario y arriendo el mismo día: el salario entra primero y no hay saldo negativo', () => {
      const [, apr2] = project(
        {
          asOf: '2026-03-10',
          openingBalance: 0,
          recurringIncomes: [{ id: 's', name: 'Salario', amount: pesos(3_000_000), day: 1, start: '2026-01-01' }],
          fixedExpenses: [{ id: 'r', name: 'Arriendo', amount: pesos(1_200_000), day: 1, start: '2026-01-01' }],
          yellowBelowIncomePct: TEN_PCT,
        },
        2,
      );
      expect(apr2?.lowestBalance).toBe(0);
      expect(apr2?.light).toBe('green');
    });

    it('rechaza months < 1', () => {
      expect(() => project(input, 0)).toThrow(RangeError);
    });
  });
});

describe('project: movimientos del mismo día del saldo', () => {
  // Confirmé mi saldo el 10 de marzo. Lo que se registró ese mismo día antes de confirmarlo ya está dentro
  // del saldo; lo que se registró después, no. El motor recibe ese dato ya resuelto como `afterBalance`.
  const base: ProjectionInput = {
    asOf: '2026-03-10',
    openingBalance: pesos(1_000_000),
    recurringIncomes: [{ id: 'salary', name: 'Salario', amount: pesos(3_000_000), day: 30, start: '2026-01-01' }],
    yellowBelowIncomePct: TEN_PCT,
  };
  const marchOf = (input: ProjectionInput) => project(input, 1)[0];

  it('un gasto del mismo día registrado después del saldo cuenta; sin la marca, no', () => {
    const expense = { id: 'x', date: '2026-03-10', amount: pesos(200_000), description: 'Almuerzo' };
    const counted = marchOf({ ...base, cashExpenses: [{ ...expense, afterBalance: true }] });
    const ignored = marchOf({ ...base, cashExpenses: [expense] });

    expect(counted?.events.map((e) => e.refId)).toEqual(['x', 'salary']);
    expect(counted?.closingBalance).toBe(pesos(3_800_000));
    expect(ignored?.events.map((e) => e.refId)).toEqual(['salary']);
    expect(ignored?.closingBalance).toBe(pesos(4_000_000));
  });

  it('un ingreso del mismo día registrado después del saldo cuenta; sin la marca, no', () => {
    const income = { id: 'bonus', date: '2026-03-10', amount: pesos(500_000), description: 'Prima' };
    expect(marchOf({ ...base, oneOffIncomes: [{ ...income, afterBalance: true }] })?.closingBalance).toBe(
      pesos(4_500_000),
    );
    expect(marchOf({ ...base, oneOffIncomes: [income] })?.closingBalance).toBe(pesos(4_000_000));
  });

  it('un evento del día anterior no cuenta aunque lleve afterBalance', () => {
    const march = marchOf({
      ...base,
      cashExpenses: [{ id: 'old', date: '2026-03-09', amount: pesos(200_000), description: 'Ayer', afterBalance: true }],
    });
    expect(march?.events.map((e) => e.refId)).toEqual(['salary']);
    expect(march?.closingBalance).toBe(pesos(4_000_000));
  });

  it('uno de un día posterior cuenta con o sin la marca', () => {
    const march = marchOf({
      ...base,
      cashExpenses: [
        { id: 'a', date: '2026-03-11', amount: pesos(100_000), description: 'A' },
        { id: 'b', date: '2026-03-12', amount: pesos(100_000), description: 'B', afterBalance: false },
      ],
    });
    expect(march?.events.map((e) => e.refId)).toEqual(['a', 'b', 'salary']);
  });

  it('el ingreso de referencia no cambia: ya incluía lo anterior al saldo y el del mismo día', () => {
    const income = { id: 'bonus', date: '2026-03-10', amount: pesos(500_000), description: 'Prima' };
    const withMark = marchOf({ ...base, oneOffIncomes: [{ ...income, afterBalance: true }] });
    const withoutMark = marchOf({ ...base, oneOffIncomes: [income] });
    expect(withMark?.referenceIncome).toBe(pesos(3_500_000));
    expect(withoutMark?.referenceIncome).toBe(pesos(3_500_000));
  });

  it('los eventos que llegan de otros módulos (extraEvents) no se desempatan: el del día del saldo no cuenta', () => {
    const march = marchOf({
      ...base,
      extraEvents: [{ date: '2026-03-10', kind: 'capital_payment', amount: -pesos(100_000), label: 'Abono', refId: 'c' }],
    });
    expect(march?.events.map((e) => e.refId)).toEqual(['salary']);
  });

  it('el evento conserva la marca en la salida', () => {
    const march = marchOf({
      ...base,
      cashExpenses: [{ id: 'x', date: '2026-03-10', amount: pesos(1), description: 'x', afterBalance: true }],
    });
    expect(march?.events[0]?.afterBalance).toBe(true);
    expect(march?.events[1]).not.toHaveProperty('afterBalance');
  });
});
