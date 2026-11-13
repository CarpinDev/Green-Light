import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { type Person, personFor } from './support/client';
import { INVITE_CODE, createE2eApp } from './support/e2e-app';
import { connect, type TestDbSettings } from './support/test-db';

// Registro, inicio de sesión y /auth/me con la base de verdad (gl_e2e_auth).

const PASSWORD = 'una-clave-larga-123';

describe('Autenticación (HTTP + Postgres)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    ({ app, close } = await createE2eApp('auth'));
  });
  afterAll(() => close());

  const register = (body: object) => request(server()).post('/auth/register').send(body);
  const login = (body: object) => request(server()).post('/auth/login').send(body);
  const signup = (email: string) => ({ email, name: 'Ana', password: PASSWORD, inviteCode: INVITE_CODE });

  describe('POST /auth/register', () => {
    it('crea la cuenta: 201 con token, vencimiento y usuario', async () => {
      const res = await register(signup('ana@example.com'));
      expect(res.status).toBe(201);
      const body = res.body as { accessToken: string; expiresAt: string; user: object };
      expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(body.user).toEqual({ id: expect.any(Number) as number, email: 'ana@example.com', name: 'Ana' });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('argon2');
    });

    it('con el token recién emitido se puede entrar a /auth/me', async () => {
      const res = await register(signup('luisa@example.com'));
      const { accessToken, user } = res.body as { accessToken: string; user: { id: number } };
      const me = await request(server()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ id: user.id, email: 'luisa@example.com', name: 'Ana' });
    });

    it('un código de invitación incorrecto: 403', async () => {
      const res = await register({ ...signup('intruso@example.com'), inviteCode: 'adivinando' });
      expect(res.status).toBe(403);
      const login403 = await login({ email: 'intruso@example.com', password: PASSWORD });
      expect(login403.status).toBe(401);
    });

    it('un email repetido: 409, también con otras mayúsculas', async () => {
      await register(signup('repetida@example.com'));
      expect((await register(signup('repetida@example.com'))).status).toBe(409);
      expect((await register(signup('REPETIDA@Example.COM'))).status).toBe(409);
    });

    it('contraseña de menos de 10 caracteres: 400', async () => {
      const res = await register({ ...signup('corta@example.com'), password: 'corta123' });
      expect(res.status).toBe(400);
    });

    it('guarda un hash argon2id y una fila de ajustes con los valores por defecto', async () => {
      await register(signup('hash@example.com'));
      const db = await connect(dbOf());
      try {
        const user = await db.query<{ id: number; password_hash: string; email: string }>(
          `SELECT id, password_hash, email FROM app_user WHERE email = $1`,
          ['hash@example.com'],
        );
        expect(user.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
        expect(user.rows[0]?.password_hash).not.toContain(PASSWORD);
        const settings = await db.query<{ y: string; s: string }>(
          `SELECT yellow_below_income_pct AS y, statement_tolerance_pct AS s FROM settings WHERE user_id = $1`,
          [user.rows[0]?.id],
        );
        expect(settings.rows).toHaveLength(1);
        expect(Number(settings.rows[0]?.y)).toBeCloseTo(0.1);
        expect(Number(settings.rows[0]?.s)).toBeCloseTo(0.02);
      } finally {
        await db.end();
      }
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await register(signup('entra@example.com'));
    });

    it('con la contraseña correcta: 200 y un token que sirve', async () => {
      const res = await login({ email: 'entra@example.com', password: PASSWORD });
      expect(res.status).toBe(200);
      const { accessToken } = res.body as { accessToken: string };
      const me = await request(server()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
      expect(me.body).toMatchObject({ email: 'entra@example.com' });
    });

    it('el email no distingue mayúsculas', async () => {
      expect((await login({ email: 'ENTRA@example.com', password: PASSWORD })).status).toBe(200);
    });

    it('contraseña mala y email inexistente dan exactamente la misma respuesta', async () => {
      const wrongPassword = await login({ email: 'entra@example.com', password: 'otra-clave-123' });
      const unknownEmail = await login({ email: 'nadie@example.com', password: PASSWORD });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect((unknownEmail.body as { message: string }).message).toBe('Email o contraseña incorrectos');
    });
  });

  describe('un token de un usuario que ya no existe', () => {
    it('es 401 en /auth/me', async () => {
      const res = await register(signup('borrada@example.com'));
      const { accessToken, user } = res.body as { accessToken: string; user: { id: number } };
      const db = await connect(dbOf());
      try {
        await db.query(`DELETE FROM app_user WHERE id = $1`, [user.id]);
      } finally {
        await db.end();
      }
      const me = await request(server()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
      expect(me.status).toBe(401);
    });
  });

  // Para tener a mano cómo conectarse a la base de este archivo
  function dbOf(): TestDbSettings {
    return {
      host: process.env.DB_HOST ?? '',
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER ?? '',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? '',
    };
  }

  it('personFor arma las llamadas con el token (sanidad del helper)', async () => {
    const res = await register(signup('helper@example.com'));
    const { accessToken, user } = res.body as { accessToken: string; user: { id: number } };
    const person: Person = personFor(app, user.id, 'helper@example.com', accessToken);
    expect((await person.get('/auth/me')).status).toBe(200);
  });
});
