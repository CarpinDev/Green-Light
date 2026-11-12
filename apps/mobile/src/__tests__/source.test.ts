import { describe, expect, it } from '@jest/globals';

import { type ExpenseSource, sourceBody, sourceOf } from '@/monthly/source';

const account: ExpenseSource = { kind: 'account', id: 3 };
const card: ExpenseSource = { kind: 'card', id: 7 };

describe('sourceOf', () => {
  it('lee el origen guardado', () => {
    expect(sourceOf({ cardId: 7, accountId: null })).toEqual(card);
    expect(sourceOf({ cardId: null, accountId: 3 })).toEqual(account);
    expect(sourceOf({ cardId: null, accountId: null })).toBeNull();
  });
});

describe('sourceBody al crear', () => {
  it('con cuenta, con tarjeta y sin nada', () => {
    expect(sourceBody(account)).toEqual({ accountId: 3 });
    expect(sourceBody(card)).toEqual({ cardId: 7 });
    expect(sourceBody(null)).toEqual({});
  });
});

describe('sourceBody al editar', () => {
  it('de tarjeta a cuenta: limpia la tarjeta', () => {
    expect(sourceBody(account, card)).toEqual({ cardId: null, accountId: 3 });
  });

  it('de cuenta a tarjeta: limpia la cuenta', () => {
    expect(sourceBody(card, account)).toEqual({ accountId: null, cardId: 7 });
  });

  it('a ninguno: manda en null el que tenía', () => {
    expect(sourceBody(null, card)).toEqual({ cardId: null });
    expect(sourceBody(null, account)).toEqual({ accountId: null });
  });

  it('de ninguno a uno: solo el nuevo', () => {
    expect(sourceBody(account, null)).toEqual({ accountId: 3 });
    expect(sourceBody(card, null)).toEqual({ cardId: 7 });
  });

  it('de una cuenta a otra, o de una tarjeta a otra: solo el campo nuevo', () => {
    expect(sourceBody({ kind: 'account', id: 4 }, account)).toEqual({ accountId: 4 });
    expect(sourceBody({ kind: 'card', id: 8 }, card)).toEqual({ cardId: 8 });
  });

  it('sin cambios: cuerpo vacío (no se manda de nuevo algo ya desactivado)', () => {
    expect(sourceBody(account, account)).toEqual({});
    expect(sourceBody(card, card)).toEqual({});
    expect(sourceBody(null, null)).toEqual({});
  });
});
