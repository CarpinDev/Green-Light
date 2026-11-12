import { describe, expect, it } from '@jest/globals';

import type { ProductUsage } from '@/api/types';
import { archiveWarning, blockerLine, usageSummary } from '@/products/lifecycle';

const usage = (overrides: Partial<ProductUsage> = {}): ProductUsage => ({
  expenses: 0,
  capitalPayments: 0,
  balances: 0,
  rates: 0,
  blockers: [],
  ...overrides,
});

describe('usageSummary', () => {
  it('plural: gastos, tasas y abonos', () => {
    expect(usageSummary(usage({ expenses: 12, rates: 3, capitalPayments: 2 }))).toBe(
      'Se borrarán 12 gastos, 3 tasas y 2 abonos. No se puede deshacer.',
    );
  });

  it('singular', () => {
    expect(usageSummary(usage({ expenses: 1, rates: 1, capitalPayments: 1 }))).toBe(
      'Se borrarán 1 gasto, 1 tasa y 1 abono. No se puede deshacer.',
    );
  });

  it('solo nombra lo que hay', () => {
    expect(usageSummary(usage({ rates: 1 }))).toBe('Se borrarán 1 tasa. No se puede deshacer.');
    expect(usageSummary(usage({ expenses: 4, rates: 2 }))).toBe(
      'Se borrarán 4 gastos y 2 tasas. No se puede deshacer.',
    );
  });

  it('una cuenta cuenta sus saldos', () => {
    expect(usageSummary(usage({ balances: 5 }))).toBe('Se borrarán 5 saldos. No se puede deshacer.');
  });

  it('nada que borrar', () => {
    expect(usageSummary(usage())).toBe('No tiene gastos, tasas, abonos ni saldos que borrar. No se puede deshacer.');
  });
});

describe('blockerLine', () => {
  it('dice qué es cada bloqueo', () => {
    expect(blockerLine({ kind: 'fixed_expense', id: 1, name: 'Arriendo' })).toBe('Gasto fijo: Arriendo');
    expect(blockerLine({ kind: 'recurring_income', id: 2, name: 'Salario' })).toBe('Ingreso mensual: Salario');
    expect(blockerLine({ kind: 'one_off_income', id: 3, name: 'Prima' })).toBe('Ingreso puntual: Prima');
  });
});

describe('archiveWarning', () => {
  it('una cuenta con saldo avisa que dejará de contar', () => {
    expect(archiveWarning('account', 150_000_000)).toMatch(
      /^Su saldo de .*1\.500\.000.* dejará de contar en tu proyección\.$/,
    );
  });

  it('también un sobregiro', () => {
    expect(archiveWarning('account', -5_000_000)).toMatch(/50\.000/);
  });

  it('sin saldo o en cero no hay aviso', () => {
    expect(archiveWarning('account', null)).toBeNull();
    expect(archiveWarning('account', 0)).toBeNull();
  });

  it('una tarjeta o un préstamo no avisan del saldo', () => {
    expect(archiveWarning('credit_card', 100)).toBeNull();
    expect(archiveWarning('loan', 100)).toBeNull();
  });
});
