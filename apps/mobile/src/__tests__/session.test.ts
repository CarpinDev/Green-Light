import { describe, expect, it } from '@jest/globals';

import { type StoredSession, isSessionActive, parseStoredSession, serializeSession } from '@/auth/session';

// Cuándo una sesión guardada sigue valiendo. La hora es un parámetro: nada de relojes de verdad.

const session = (expiresAt: string): StoredSession => ({
  token: 'abc.def.ghi',
  expiresAt,
  user: { id: 7, email: 'ana@example.com', name: 'Ana' },
});

describe('isSessionActive', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');

  it('vale si vence después de ahora', () => {
    expect(isSessionActive(session('2026-12-12T12:00:00.000Z'), now)).toBe(true);
  });

  it('un segundo antes de vencer todavía vale', () => {
    expect(isSessionActive(session('2026-11-12T12:00:01.000Z'), now)).toBe(true);
  });

  it('justo en el instante de vencer ya no vale', () => {
    expect(isSessionActive(session('2026-11-12T12:00:00.000Z'), now)).toBe(false);
  });

  it('vencida hace un día: no vale', () => {
    expect(isSessionActive(session('2026-11-11T12:00:00.000Z'), now)).toBe(false);
  });

  it('una fecha ilegible cuenta como vencida, no como eterna', () => {
    expect(isSessionActive(session('mañana'), now)).toBe(false);
    expect(isSessionActive(session(''), now)).toBe(false);
  });
});

describe('parseStoredSession', () => {
  it('lee lo que serializeSession guardó', () => {
    const original = session('2026-12-12T12:00:00.000Z');
    expect(parseStoredSession(serializeSession(original))).toEqual(original);
  });

  it('sin nada guardado: null', () => {
    expect(parseStoredSession(null)).toBeNull();
  });

  it.each([
    ['vacío', ''],
    ['JSON roto', '{"token": '],
    ['no es un objeto', '42'],
    ['null', 'null'],
    ['sin token', JSON.stringify({ expiresAt: 'x', user: { id: 1, email: 'a@b.c', name: 'A' } })],
    ['token vacío', JSON.stringify({ token: '', expiresAt: 'x', user: { id: 1, email: 'a@b.c', name: 'A' } })],
    ['sin usuario', JSON.stringify({ token: 't', expiresAt: 'x' })],
    ['usuario sin email', JSON.stringify({ token: 't', expiresAt: 'x', user: { id: 1, name: 'A' } })],
    [
      'id que no es número',
      JSON.stringify({ token: 't', expiresAt: 'x', user: { id: '1', email: 'a@b.c', name: 'A' } }),
    ],
  ])('%s: null', (_label, raw) => {
    expect(parseStoredSession(raw)).toBeNull();
  });

  it('descarta campos de más en vez de arrastrarlos', () => {
    const raw = JSON.stringify({
      ...session('2026-12-12T12:00:00.000Z'),
      extra: 'x',
      user: { id: 1, email: 'a@b.c', name: 'A', admin: true },
    });
    expect(parseStoredSession(raw)).toEqual({
      token: 'abc.def.ghi',
      expiresAt: '2026-12-12T12:00:00.000Z',
      user: { id: 1, email: 'a@b.c', name: 'A' },
    });
  });
});
