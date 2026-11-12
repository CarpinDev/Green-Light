import { describe, expect, it } from '@jest/globals';

import { overdraftCheck } from '@/expenses/overdraft';

const base = {
  amountCents: 3_000_000,
  fromCard: false,
  balanceCents: 8_000_000,
  date: '2026-11-12',
  today: '2026-11-12',
  asOf: '2026-11-10',
};

describe('overdraftCheck', () => {
  it('un monto menor que el saldo no pide confirmar', () => {
    expect(overdraftCheck(base)).toBeNull();
  });

  it('un monto igual al saldo tampoco: queda en cero', () => {
    expect(overdraftCheck({ ...base, amountCents: 8_000_000 })).toBeNull();
  });

  it('un monto mayor pide confirmar y dice cómo quedaría', () => {
    expect(overdraftCheck({ ...base, amountCents: 200_000_000 })).toEqual({
      balanceCents: 8_000_000,
      resultCents: -192_000_000,
    });
  });

  it('con un saldo ya negativo, cualquier gasto avisa', () => {
    expect(overdraftCheck({ ...base, balanceCents: -100, amountCents: 1 })).toEqual({
      balanceCents: -100,
      resultCents: -101,
    });
  });

  it('un gasto con tarjeta nunca pide confirmar', () => {
    expect(overdraftCheck({ ...base, amountCents: 200_000_000, fromCard: true })).toBeNull();
  });

  it('sin saldo conocido no estorba', () => {
    expect(overdraftCheck({ ...base, amountCents: 200_000_000, balanceCents: null })).toBeNull();
  });

  it('un gasto con fecha futura no baja el saldo de hoy', () => {
    expect(overdraftCheck({ ...base, amountCents: 200_000_000, date: '2026-11-20' })).toBeNull();
  });

  it('uno anterior al último saldo confirmado ya está dentro de ese saldo; el del mismo día sí cuenta', () => {
    expect(overdraftCheck({ ...base, amountCents: 200_000_000, date: '2026-11-09' })).toBeNull();
    expect(overdraftCheck({ ...base, amountCents: 200_000_000, date: '2026-11-10' })).not.toBeNull();
  });
});
