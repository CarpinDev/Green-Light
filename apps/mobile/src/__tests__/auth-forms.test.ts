import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/api/client';
import { MIN_PASSWORD_LENGTH, authErrorText, validateLogin, validateRegister } from '@/auth/forms';

describe('validateLogin', () => {
  it('con email y contraseña, se puede enviar', () => {
    expect(validateLogin({ email: 'ana@example.com', password: 'x' })).toBeNull();
  });

  it('el email se revisa sin espacios alrededor', () => {
    expect(validateLogin({ email: '  ana@example.com ', password: 'x' })).toBeNull();
  });

  it.each(['', 'ana', 'ana@', '@example.com', 'ana@example', 'a na@example.com'])('email %p: no es válido', (email) => {
    expect(validateLogin({ email, password: 'x' })).toMatch(/email/i);
  });

  it('sin contraseña: pide la contraseña', () => {
    expect(validateLogin({ email: 'ana@example.com', password: '' })).toMatch(/contraseña/i);
  });
});

describe('validateRegister', () => {
  const ok = { name: 'Ana', email: 'ana@example.com', password: 'una-clave-larga-123', inviteCode: 'codigo' };

  it('todo bien, se puede enviar', () => {
    expect(validateRegister(ok)).toBeNull();
  });

  it('pide el nombre', () => {
    expect(validateRegister({ ...ok, name: '   ' })).toMatch(/nombre/i);
  });

  it('pide un email válido', () => {
    expect(validateRegister({ ...ok, email: 'ana' })).toMatch(/email/i);
  });

  it(`la contraseña de ${MIN_PASSWORD_LENGTH - 1} caracteres no alcanza; la de ${MIN_PASSWORD_LENGTH} sí`, () => {
    expect(validateRegister({ ...ok, password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) })).toMatch(/al menos 10/);
    expect(validateRegister({ ...ok, password: 'x'.repeat(MIN_PASSWORD_LENGTH) })).toBeNull();
  });

  it('pide el código de invitación', () => {
    expect(validateRegister({ ...ok, inviteCode: ' ' })).toMatch(/código/i);
  });

  it('dice un solo problema a la vez: el primero', () => {
    expect(validateRegister({ name: '', email: '', password: '', inviteCode: '' })).toMatch(/nombre/i);
  });
});

describe('authErrorText', () => {
  it('un 429 explica el límite de intentos', () => {
    expect(authErrorText(new ApiError(429, 'ThrottlerException: Too Many Requests'))).toMatch(/demasiados intentos/i);
  });

  it('un 401 muestra el mensaje de la API', () => {
    expect(authErrorText(new ApiError(401, 'Email o contraseña incorrectos'))).toBe('Email o contraseña incorrectos');
  });

  it('un 403 (código de invitación) y un 409 (email repetido) muestran el mensaje de la API', () => {
    expect(authErrorText(new ApiError(403, 'Código de invitación incorrecto'))).toBe('Código de invitación incorrecto');
    expect(authErrorText(new ApiError(409, 'Ya existe una cuenta con ese email'))).toBe(
      'Ya existe una cuenta con ese email',
    );
  });

  it('sin conexión, avisa que no hay conexión', () => {
    expect(authErrorText(new TypeError('Network request failed'))).toMatch(/conexión/i);
  });
});
