import { describe, expect, it } from '@jest/globals';

import { incomeAlreadyInBalance, projectionAsOf, selectedAccountId, validateIncome } from '@/incomes/logic';

describe('incomeAlreadyInBalance', () => {
  it('sin saldo confirmado no hay de dónde partir: false', () => {
    expect(incomeAlreadyInBalance('2026-11-12', null)).toBe(false);
  });

  it('la misma fecha del saldo ya está dentro: true', () => {
    expect(incomeAlreadyInBalance('2026-11-10', '2026-11-10')).toBe(true);
  });

  it('un día después del saldo sí mueve la proyección: false', () => {
    expect(incomeAlreadyInBalance('2026-11-11', '2026-11-10')).toBe(false);
  });

  it('una fecha anterior al saldo ya está dentro: true', () => {
    expect(incomeAlreadyInBalance('2026-11-01', '2026-11-10')).toBe(true);
    expect(incomeAlreadyInBalance('2025-12-31', '2026-01-01')).toBe(true);
  });

  it('una fecha futura nunca está dentro del saldo', () => {
    expect(incomeAlreadyInBalance('2026-12-20', '2026-11-10')).toBe(false);
  });
});

describe('projectionAsOf', () => {
  it('es el saldo más reciente entre todas las cuentas', () => {
    expect(
      projectionAsOf([
        { id: 1, latestBalance: { asOf: '2026-11-01' } },
        { id: 2, latestBalance: { asOf: '2026-11-10' } },
        { id: 3, latestBalance: null },
      ]),
    ).toBe('2026-11-10');
  });

  it('sin ningún saldo, null', () => {
    expect(projectionAsOf([])).toBeNull();
    expect(projectionAsOf([{ id: 1, latestBalance: null }])).toBeNull();
  });

  it('una cuenta con un saldo viejo no mueve la fecha: un ingreso entre las dos fechas ya está fuera de la proyección', () => {
    const accounts = [
      { id: 1, latestBalance: { asOf: '2026-11-01' } }, // vieja
      { id: 2, latestBalance: { asOf: '2026-11-10' } },
    ];
    // Entró el 5 a la cuenta vieja (después de su saldo), pero la proyección parte del 10: no la cuenta
    expect(incomeAlreadyInBalance('2026-11-05', projectionAsOf(accounts))).toBe(true);
  });
});

describe('selectedAccountId', () => {
  const one = [{ id: 7 }];
  const two = [{ id: 7 }, { id: 8 }];

  it('con una sola cuenta viene elegida', () => {
    expect(selectedAccountId(one, null)).toBe(7);
  });

  it('con varias, ninguna hasta que el usuario elige', () => {
    expect(selectedAccountId(two, null)).toBeNull();
    expect(selectedAccountId(two, 8)).toBe(8);
  });

  it('sin cuentas, null; una elegida que ya no existe se ignora', () => {
    expect(selectedAccountId([], null)).toBeNull();
    expect(selectedAccountId(two, 99)).toBeNull();
    expect(selectedAccountId(one, 99)).toBe(7);
  });

  it('lo que el usuario eligió gana sobre la cuenta única', () => {
    expect(selectedAccountId(one, 7)).toBe(7);
  });
});

describe('validateIncome', () => {
  const ok = { amountCents: 50_000_000, accountId: 1, date: '2026-11-12' };

  it('un ingreso completo no tiene error', () => {
    expect(validateIncome(ok)).toBeNull();
  });

  it('el monto es obligatorio y mayor que 0', () => {
    expect(validateIncome({ ...ok, amountCents: null })).toMatch(/cuánto/);
    expect(validateIncome({ ...ok, amountCents: 0 })).toMatch(/cuánto/);
    expect(validateIncome({ ...ok, amountCents: -5 })).toMatch(/cuánto/);
  });

  it('la cuenta es obligatoria', () => {
    expect(validateIncome({ ...ok, accountId: null })).toMatch(/cuenta/);
  });

  it('la fecha debe existir; una futura vale', () => {
    expect(validateIncome({ ...ok, date: '2026-02-30' })).toMatch(/fecha/);
    expect(validateIncome({ ...ok, date: '2027-01-20' })).toBeNull();
  });
});
