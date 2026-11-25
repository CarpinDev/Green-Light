import { describe, expect, it } from '@jest/globals';

import type { CashEvent, Movement } from '@/api/types';
import {
  type ConfirmTarget,
  SHORTFALL_WARNING,
  confirmLabel,
  confirmParams,
  debtPaymentBody,
  excessNote,
  paidSummary,
  parseConfirmTarget,
  recurringBody,
  splitPayment,
  targetFromEvent,
  targetFromMovement,
  undoOfMovement,
  validateConfirmation,
} from '@/payments/logic';

const nu: ConfirmTarget = {
  kind: 'card',
  id: 7,
  scheduledDate: '2026-11-18',
  name: 'Pago mínimo tarjeta',
  expectedCents: 15_000_000,
  fullPaymentCents: 90_000_000,
};
const account = { kind: 'account', id: 3 } as const;

const event = (overrides: Partial<CashEvent> = {}): CashEvent => ({
  date: '2026-12-04',
  kind: 'card_payment',
  amount: -15_000_000,
  label: 'Pago mínimo tarjeta (corte 2026-11-18)',
  refId: '7',
  cutDate: '2026-11-18',
  fullPayment: 90_000_000,
  scheduledDate: '2026-11-18',
  ...overrides,
});

describe('splitPayment: excedente y faltante', () => {
  it('pagar el mínimo exacto no deja ni excedente ni faltante', () => {
    expect(splitPayment(15_000_000, 15_000_000)).toEqual({ excess: 0, shortfall: 0 });
  });

  it('pagar más: lo que pasa es excedente (abono a capital)', () => {
    expect(splitPayment(90_000_000, 15_000_000)).toEqual({ excess: 75_000_000, shortfall: 0 });
  });

  it('pagar menos: lo que falta es faltante', () => {
    expect(splitPayment(10_000_000, 15_000_000)).toEqual({ excess: 0, shortfall: 5_000_000 });
  });
});

describe('textos', () => {
  it('el aviso de mora dice que Green Light todavía no la calcula', () => {
    expect(SHORTFALL_WARNING).toBe(
      'Pagaste menos del mínimo: el banco te cobrará intereses de mora que Green Light todavía no calcula.',
    );
  });

  it('el botón: "Llegó" en un ingreso y "Marcar pagado" en lo demás', () => {
    expect(confirmLabel('income')).toBe('Llegó');
    expect(['card', 'loan', 'fixed'].map((k) => confirmLabel(k as ConfirmTarget['kind']))).toEqual([
      'Marcar pagado',
      'Marcar pagado',
      'Marcar pagado',
    ]);
  });

  it('la nota del excedente y el resumen de un pago confirmado', () => {
    expect(excessNote(10_000_000)).toMatch(/excedente \(.*100\.000\) se registra como abono a capital/);
    expect(paidSummary({ id: 1, paidDate: '2026-11-25', amountCents: 15_000_000, excessCents: 0 })).toMatch(
      /^Pagado el .*25.* · .*150\.000$/,
    );
    expect(paidSummary({ id: 1, paidDate: '2026-11-25', amountCents: 15_000_000, excessCents: 5_000_000 })).toMatch(
      /de abono a capital$/,
    );
  });
});

describe('targetFromEvent: qué se puede confirmar de un evento', () => {
  it('un pago de tarjeta: el mínimo, el total y el corte como clave', () => {
    expect(targetFromEvent(event())).toEqual({
      kind: 'card',
      id: 7,
      scheduledDate: '2026-11-18',
      name: 'Pago mínimo tarjeta',
      expectedCents: 15_000_000,
      fullPaymentCents: 90_000_000,
    });
  });

  it('una cuota, un salario y un gasto fijo', () => {
    expect(
      targetFromEvent(event({ kind: 'loan_payment', refId: '9', scheduledDate: '2026-12-10', label: 'Cuota 3' })),
    ).toMatchObject({
      kind: 'loan',
      id: 9,
      scheduledDate: '2026-12-10',
    });
    expect(
      targetFromEvent(event({ kind: 'income', amount: 300_000_000, refId: '30', label: 'Salario' })),
    ).toMatchObject({
      kind: 'income',
      expectedCents: 300_000_000,
    });
    expect(
      targetFromEvent(event({ kind: 'fixed_expense', amount: -100_000_000, refId: '40', label: 'Arriendo' })),
    ).toMatchObject({
      kind: 'fixed',
      name: 'Arriendo',
    });
  });

  it('no se confirma lo ya confirmado, lo sin fecha programada (el faltante) ni un abono', () => {
    expect(targetFromEvent(event({ confirmed: true }))).toBeNull();
    expect(targetFromEvent(event({ scheduledDate: undefined }))).toBeNull();
    expect(targetFromEvent(event({ kind: 'capital_payment' }))).toBeNull();
    expect(targetFromEvent(event({ refId: undefined }))).toBeNull();
  });
});

describe('targetFromMovement y undoOfMovement (Recientes)', () => {
  const movement = (overrides: Partial<Movement> = {}): Movement => ({
    id: 'recurring:30:2026-11-15',
    type: 'income',
    direction: 'in',
    date: '2026-11-15',
    amountCents: 300_000_000,
    description: 'Salario',
    categoryName: null,
    product: null,
    installments: null,
    isOpeningDebt: false,
    sourceLabel: null,
    scheduled: true,
    scheduledDate: '2026-11-15',
    refId: 30,
    refKind: 'recurring_income',
    confirmationId: null,
    debtPaymentId: null,
    ...overrides,
  });

  it('un salario programado se confirma con su fecha esperada', () => {
    expect(targetFromMovement(movement())).toEqual({
      kind: 'income',
      id: 30,
      scheduledDate: '2026-11-15',
      name: 'Salario',
      expectedCents: 300_000_000,
    });
  });

  it('un gasto fijo con tarjeta (sin refId) y lo ya confirmado no se confirman', () => {
    expect(targetFromMovement(movement({ refId: null, refKind: null }))).toBeNull();
    expect(targetFromMovement(movement({ scheduled: false }))).toBeNull();
  });

  it('lo confirmado se deshace con su propio recurso', () => {
    expect(undoOfMovement({ debtPaymentId: 7, confirmationId: null })).toEqual({ path: '/debt-payments/7' });
    expect(undoOfMovement({ debtPaymentId: null, confirmationId: 4 })).toEqual({ path: '/recurring-confirmations/4' });
    expect(undoOfMovement({ debtPaymentId: null, confirmationId: null })).toBeNull();
  });
});

describe('confirmParams / parseConfirmTarget', () => {
  it('ida y vuelta', () => {
    expect(parseConfirmTarget(confirmParams(nu))).toEqual(nu);
  });

  it('una URL incompleta o rara no abre nada', () => {
    expect(parseConfirmTarget({})).toBeNull();
    expect(parseConfirmTarget({ ...confirmParams(nu), kind: 'otro' })).toBeNull();
    expect(parseConfirmTarget({ ...confirmParams(nu), expected: 'mucho' })).toBeNull();
    expect(parseConfirmTarget({ ...confirmParams(nu), id: '0' })).toBeNull();
  });
});

describe('debtPaymentBody', () => {
  const base = { target: nu, paidDate: '2026-11-25', source: account, mode: 'reduce_payment' as const };

  it('por el mínimo: sin mode (no hay abono que reducir)', () => {
    expect(debtPaymentBody({ ...base, amountCents: 15_000_000 })).toEqual({
      productId: 7,
      scheduledDate: '2026-11-18',
      paidDate: '2026-11-25',
      amountCents: 15_000_000,
      sourceAccountId: 3,
    });
  });

  it('con excedente: manda el mode elegido', () => {
    expect(debtPaymentBody({ ...base, amountCents: 90_000_000 })).toMatchObject({ mode: 'reduce_payment' });
  });

  it('con faltante: sin mode', () => {
    expect(debtPaymentBody({ ...base, amountCents: 10_000_000 })).not.toHaveProperty('mode');
  });

  it('externo manda external y no una cuenta', () => {
    const body = debtPaymentBody({ ...base, source: { kind: 'external' }, amountCents: 15_000_000 });
    expect(body).toMatchObject({ external: true });
    expect(body).not.toHaveProperty('sourceAccountId');
  });

  it('sin origen o sin monto no hay cuerpo', () => {
    expect(debtPaymentBody({ ...base, source: null, amountCents: 15_000_000 })).toBeNull();
    expect(debtPaymentBody({ ...base, amountCents: null })).toBeNull();
    expect(debtPaymentBody({ ...base, amountCents: 0 })).toBeNull();
  });
});

describe('recurringBody', () => {
  const salary: ConfirmTarget = {
    kind: 'income',
    id: 30,
    scheduledDate: '2026-11-15',
    name: 'Salario',
    expectedCents: 300_000_000,
  };
  const rent: ConfirmTarget = {
    kind: 'fixed',
    id: 40,
    scheduledDate: '2026-11-05',
    name: 'Arriendo',
    expectedCents: 100_000_000,
  };

  it('el salario manda recurringIncomeId, la fecha real y el monto real', () => {
    expect(recurringBody({ target: salary, actualDate: '2026-11-13', amountCents: 280_000_000, accountId: 3 })).toEqual(
      {
        recurringIncomeId: 30,
        scheduledDate: '2026-11-15',
        actualDate: '2026-11-13',
        amountCents: 280_000_000,
        accountId: 3,
      },
    );
  });

  it('un gasto fijo manda fixedExpenseId; la cuenta es opcional', () => {
    const body = recurringBody({ target: rent, actualDate: '2026-11-07', amountCents: 105_000_000, accountId: null });
    expect(body).toMatchObject({ fixedExpenseId: 40 });
    expect(body).not.toHaveProperty('accountId');
    expect(body).not.toHaveProperty('recurringIncomeId');
  });

  it('sin monto no hay cuerpo', () => {
    expect(recurringBody({ target: rent, actualDate: '2026-11-07', amountCents: null, accountId: null })).toBeNull();
  });
});

describe('validateConfirmation', () => {
  const ok = { target: nu, amountCents: 15_000_000, source: account, date: '2026-11-25', today: '2026-11-25' };

  it('un pago válido no tiene error', () => {
    expect(validateConfirmation(ok)).toBeNull();
  });

  it('pide monto, y origen en las deudas (no en un ingreso)', () => {
    expect(validateConfirmation({ ...ok, amountCents: null })).toMatch(/cuánto/);
    expect(validateConfirmation({ ...ok, source: null })).toMatch(/de dónde/);
    const salary: ConfirmTarget = {
      kind: 'income',
      id: 30,
      scheduledDate: '2026-11-15',
      name: 'Salario',
      expectedCents: 1,
    };
    expect(validateConfirmation({ ...ok, target: salary, source: null })).toBeNull();
  });

  it('la fecha no puede ser futura ni anterior al corte de una tarjeta', () => {
    expect(validateConfirmation({ ...ok, date: '2026-11-26' })).toMatch(/futura/);
    expect(validateConfirmation({ ...ok, date: '2026-11-17' })).toMatch(/antes del corte/);
  });

  it('una cuota sí se puede pagar antes de su fecha', () => {
    const loan: ConfirmTarget = { kind: 'loan', id: 9, scheduledDate: '2026-12-10', name: 'Cuota', expectedCents: 1 };
    expect(validateConfirmation({ ...ok, target: loan, date: '2026-11-25' })).toBeNull();
  });
});
