import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

// Las rutas HTTP de /auth con un AuthService falso: la validación del cuerpo, los códigos de estado y el límite de
// intentos. El guard es el real, para comprobar también que /auth/me pide token y register/login no.

const SECRET = 'un-secreto-de-prueba-de-al-menos-32-caracteres';
const LIMIT = 3;

describe('AuthController (HTTP)', () => {
  let app: INestApplication;
  const register = jest.fn();
  const login = jest.fn();
  const me = jest.fn();
  const server = () => app.getHttpServer() as Server;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: SECRET, signOptions: { algorithm: 'HS256', expiresIn: '1h' } }),
        // Un límite bajo, para llegar a él en la prueba; en producción son 5 por minuto
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: LIMIT }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { register, login, me } },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    register.mockReset().mockResolvedValue({ accessToken: 't' });
    login.mockReset().mockResolvedValue({ accessToken: 't' });
    me.mockReset().mockResolvedValue({ id: 1, email: 'ana@example.com', name: 'Ana' });
  });
  afterEach(() => app.close());

  const credentials = { email: 'ana@example.com', password: 'una-clave-larga-123' };
  const signup = { ...credentials, name: 'Ana', inviteCode: 'codigo' };

  describe('POST /auth/login', () => {
    it('es pública (sin token) y responde 200', async () => {
      const res = await request(server()).post('/auth/login').send(credentials);
      expect(res.status).toBe(200);
      expect(login).toHaveBeenCalledWith(credentials);
    });

    it('normaliza el email a minúsculas antes de llegar al service', async () => {
      await request(server())
        .post('/auth/login')
        .send({ ...credentials, email: '  ANA@Example.COM ' });
      expect(login).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }));
    });

    it.each([
      ['sin email', { password: 'x' }],
      ['con un email inválido', { email: 'no-es-email', password: 'x' }],
      ['sin contraseña', { email: 'ana@example.com' }],
      ['con una contraseña gigante', { email: 'ana@example.com', password: 'x'.repeat(129) }],
      ['con un campo de más', { ...credentials, admin: true }],
    ])('%s: 400 y no llega al service', async (_label, body) => {
      const res = await request(server()).post('/auth/login').send(body);
      expect(res.status).toBe(400);
      expect(login).not.toHaveBeenCalled();
    });

    it(`a partir del intento ${LIMIT + 1} en un minuto: 429`, async () => {
      for (let i = 0; i < LIMIT; i++) {
        expect((await request(server()).post('/auth/login').send(credentials)).status).toBe(200);
      }
      expect((await request(server()).post('/auth/login').send(credentials)).status).toBe(429);
    });
  });

  describe('POST /auth/register', () => {
    it('es pública y responde 201', async () => {
      const res = await request(server()).post('/auth/register').send(signup);
      expect(res.status).toBe(201);
      expect(register).toHaveBeenCalledWith(signup);
    });

    it('una contraseña de menos de 10 caracteres: 400 con el motivo', async () => {
      const res = await request(server())
        .post('/auth/register')
        .send({ ...signup, password: 'corta123' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('al menos 10');
      expect(register).not.toHaveBeenCalled();
    });

    it('de exactamente 10 caracteres pasa', async () => {
      const res = await request(server())
        .post('/auth/register')
        .send({ ...signup, password: '1234567890' });
      expect(res.status).toBe(201);
    });

    it.each([
      ['sin código de invitación', { ...signup, inviteCode: undefined }],
      ['sin nombre', { ...signup, name: '' }],
      ['con un nombre larguísimo', { ...signup, name: 'a'.repeat(101) }],
      ['con un email inválido', { ...signup, email: 'ana@' }],
    ])('%s: 400', async (_label, body) => {
      const res = await request(server()).post('/auth/register').send(body);
      expect(res.status).toBe(400);
      expect(register).not.toHaveBeenCalled();
    });

    it(`también tiene límite de intentos: el ${LIMIT + 1}.º da 429`, async () => {
      for (let i = 0; i < LIMIT; i++) await request(server()).post('/auth/register').send(signup);
      expect((await request(server()).post('/auth/register').send(signup)).status).toBe(429);
    });

    it('el límite de register no gasta el de login (cada ruta cuenta aparte)', async () => {
      for (let i = 0; i < LIMIT; i++) await request(server()).post('/auth/register').send(signup);
      expect((await request(server()).post('/auth/login').send(credentials)).status).toBe(200);
    });
  });

  describe('GET /auth/me', () => {
    it('sin token: 401', async () => {
      const res = await request(server()).get('/auth/me');
      expect(res.status).toBe(401);
      expect(me).not.toHaveBeenCalled();
    });

    it('con un token válido: 200 y le pasa al service el id del token, no uno de la URL', async () => {
      const token = await app.get(JwtService).signAsync({ sub: 42, email: 'ana@example.com' });
      const res = await request(server()).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(me).toHaveBeenCalledWith(42);
    });

    it('con un token falso: 401', async () => {
      const res = await request(server()).get('/auth/me').set('Authorization', 'Bearer abc.def.ghi');
      expect(res.status).toBe(401);
    });

    it('no tiene límite de intentos (solo login y register lo tienen)', async () => {
      for (let i = 0; i < LIMIT + 2; i++) {
        expect((await request(server()).get('/auth/me')).status).toBe(401);
      }
    });
  });
});
