import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Settings } from '../settings/entities/settings.entity';
import { FakeDb } from '../testing/fake-db';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// argon2 de verdad, pero con verify envuelta en un mock para poder contar cuántas veces se llama
jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});

// Registro e inicio de sesión sobre un FakeDb (sin Postgres) y con argon2 de verdad.

const SECRET = 'un-secreto-de-prueba-de-al-menos-32-caracteres';
const INVITE = 'codigo-de-invitacion';
const PASSWORD = 'una-clave-larga-123';

describe('AuthService', () => {
  let db: FakeDb;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    db = new FakeDb();
    db.unique.set(User, [['email']]);
    db.keyBy.set(Settings, 'userId');
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '30d' } });
    const config = { getOrThrow: (key: string) => ({ INVITE_CODE: INVITE })[key] } as unknown as ConfigService;
    service = new AuthService(new UsersService(db.dataSource()), jwt, config);
  });

  const register = (overrides: Partial<Parameters<AuthService['register']>[0]> = {}) =>
    service.register({ email: 'ana@example.com', name: 'Ana', password: PASSWORD, inviteCode: INVITE, ...overrides });

  describe('register', () => {
    it('con el código correcto crea el usuario y su fila de ajustes con los valores por defecto', async () => {
      const session = await register();

      const [user] = db.rows(User);
      expect(user).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
      expect(session.user).toEqual({ id: user?.id, email: 'ana@example.com', name: 'Ana' });
      expect(db.rows(Settings)).toHaveLength(1);
      expect(db.rows(Settings)[0]?.userId).toBe(user?.id);
    });

    it('guarda un hash argon2id, nunca la contraseña', async () => {
      await register();
      const hash = db.rows(User)[0]?.passwordHash ?? '';
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain(PASSWORD);
      await expect(argon2.verify(hash, PASSWORD)).resolves.toBe(true);
    });

    it('responde como el login: token, vencimiento y usuario (sin el hash)', async () => {
      const session = await register();
      expect(session.accessToken.split('.')).toHaveLength(3);
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(session.user).not.toHaveProperty('passwordHash');
    });

    it('el token lleva el id del usuario en sub, y vence como dice expiresAt', async () => {
      const { accessToken, expiresAt, user } = await register();
      const payload = await jwt.verifyAsync<{ sub: number; email: string; exp: number }>(accessToken);
      expect(payload.sub).toBe(user.id);
      expect(new Date(payload.exp * 1000).toISOString()).toBe(expiresAt);
    });

    it('un código incorrecto es 403 y no crea nada', async () => {
      await expect(register({ inviteCode: 'otro' })).rejects.toThrow(ForbiddenException);
      expect(db.rows(User)).toHaveLength(0);
      expect(db.rows(Settings)).toHaveLength(0);
    });

    it('un código casi igual (mayúsculas, espacio) tampoco sirve', async () => {
      await expect(register({ inviteCode: INVITE.toUpperCase() })).rejects.toThrow(ForbiddenException);
      await expect(register({ inviteCode: `${INVITE} ` })).rejects.toThrow(ForbiddenException);
    });

    it('el código se revisa antes que el email: sin él no se revela si un email ya existe', async () => {
      await register();
      await expect(register({ inviteCode: 'otro' })).rejects.toThrow(ForbiddenException);
    });

    it('un email repetido es 409', async () => {
      await register();
      await expect(register({ name: 'Otra' })).rejects.toThrow(ConflictException);
      expect(db.rows(User)).toHaveLength(1);
    });

    it('un email repetido con otras mayúsculas o espacios también es 409', async () => {
      await register();
      await expect(register({ email: 'ANA@Example.COM' })).rejects.toThrow(ConflictException);
      await expect(register({ email: '  ana@example.com ' })).rejects.toThrow(ConflictException);
      expect(db.rows(User)).toHaveLength(1);
    });

    it('guarda el email en minúsculas', async () => {
      await register({ email: 'Ana@Example.COM' });
      expect(db.rows(User)[0]?.email).toBe('ana@example.com');
    });

    it('si falla guardar los ajustes, tampoco queda el usuario (una transacción)', async () => {
      db.failOn = Settings;
      await expect(register()).rejects.toThrow('la base se cayó');
      expect(db.rows(User)).toHaveLength(0);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register();
    });

    it('con la contraseña correcta devuelve token, vencimiento y usuario', async () => {
      const session = await service.login({ email: 'ana@example.com', password: PASSWORD });
      expect(session.user).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
      const payload = await jwt.verifyAsync<{ sub: number }>(session.accessToken);
      expect(payload.sub).toBe(session.user.id);
    });

    it('el email no distingue mayúsculas', async () => {
      await expect(service.login({ email: 'ANA@example.com', password: PASSWORD })).resolves.toBeDefined();
    });

    it('una contraseña incorrecta es 401', async () => {
      await expect(service.login({ email: 'ana@example.com', password: 'otra-clave-123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('un email que no existe es 401 con el MISMO mensaje que una contraseña mala', async () => {
      const wrongPassword = await service
        .login({ email: 'ana@example.com', password: 'otra-clave-123' })
        .catch((e: UnauthorizedException) => e);
      const unknownEmail = await service
        .login({ email: 'nadie@example.com', password: PASSWORD })
        .catch((e: UnauthorizedException) => e);

      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
      expect((unknownEmail as Error).message).toBe('Email o contraseña incorrectos');
    });

    it('con un email que no existe también corre argon2.verify (contra un hash falso), para no delatarlo por el tiempo', async () => {
      const verify = argon2.verify as unknown as jest.Mock;
      verify.mockClear();
      await service.login({ email: 'nadie@example.com', password: PASSWORD }).catch(() => undefined);
      expect(verify).toHaveBeenCalledTimes(1);
    });

    it('un hash guardado corrupto es un 401, no un error 500', async () => {
      const row = db.rows(User)[0];
      if (row) row.passwordHash = 'esto-no-es-un-hash';
      await expect(service.login({ email: 'ana@example.com', password: PASSWORD })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('me', () => {
    it('devuelve id, email y nombre del dueño del token', async () => {
      const { user } = await register();
      await expect(service.me(user.id)).resolves.toEqual({ id: user.id, email: 'ana@example.com', name: 'Ana' });
    });

    it('un usuario que ya no existe es 401', async () => {
      await expect(service.me(999)).rejects.toThrow(UnauthorizedException);
    });
  });
});
