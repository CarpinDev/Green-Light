import { describe, expect, it } from '@jest/globals';

import { modeLabel, paymentBody, sourceBody, sourceLabel, validatePayment } from '@/products/payment';

describe('sourceBody', () => {
  it('una cuenta manda su id', () => {
    expect(sourceBody({ kind: 'account', id: 4 })).toEqual({ sourceAccountId: 4 });
  });

  it('externo manda external: true', () => {
    expect(sourceBody({ kind: 'external' })).toEqual({ external: true });
  });

  it('sin elegir no hay cuerpo', () => {
    expect(sourceBody(null)).toBeNull();
  });

  it('nunca manda los dos', () => {
    for (const source of [{ kind: 'account' as const, id: 4 }, { kind: 'external' as const }]) {
      const body = sourceBody(source) as object;
      expect('sourceAccountId' in body && 'external' in body).toBe(false);
    }
  });
});

describe('validatePayment', () => {
  it('pide el monto y el origen', () => {
    expect(validatePayment({ amountCents: null, source: { kind: 'external' } })).toMatch(/cuánto/);
    expect(validatePayment({ amountCents: 0, source: { kind: 'external' } })).toMatch(/cuánto/);
    expect(validatePayment({ amountCents: 100, source: null })).toMatch(/de dónde sale/);
  });

  it('con las dos cosas, es válido', () => {
    expect(validatePayment({ amountCents: 100, source: { kind: 'account', id: 4 } })).toBeNull();
  });
});

describe('paymentBody', () => {
  const base = { cardId: 7, amountCents: 50_000_000, date: '2026-11-12', mode: 'reduce_term' as const };

  it('desde una cuenta', () => {
    expect(paymentBody({ ...base, source: { kind: 'account', id: 4 } })).toEqual({
      productId: 7,
      date: '2026-11-12',
      amountCents: 50_000_000,
      mode: 'reduce_term',
      sourceAccountId: 4,
    });
  });

  it('externo', () => {
    expect(paymentBody({ ...base, mode: 'reduce_payment', source: { kind: 'external' } })).toEqual({
      productId: 7,
      date: '2026-11-12',
      amountCents: 50_000_000,
      mode: 'reduce_payment',
      external: true,
    });
  });

  it('sin origen o sin monto, no hay cuerpo', () => {
    expect(paymentBody({ ...base, source: null })).toBeNull();
    expect(paymentBody({ ...base, amountCents: null, source: { kind: 'external' } })).toBeNull();
  });
});

describe('textos', () => {
  it('sourceLabel', () => {
    expect(sourceLabel({ kind: 'account', id: 4, name: 'Ahorros', last4: '1357' })).toBe('desde Ahorros ••1357');
    expect(sourceLabel({ kind: 'external' })).toBe('externo');
    expect(sourceLabel(null)).toBe('');
  });

  it('modeLabel', () => {
    expect(modeLabel('reduce_term')).toBe('reduce el plazo');
    expect(modeLabel('reduce_payment')).toBe('reduce la cuota');
  });
});
