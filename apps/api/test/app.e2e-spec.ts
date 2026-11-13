import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';

// La app completa contra un Postgres local desechable (gl_e2e_app). Necesita "docker compose up -d".

describe('La API completa', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    ({ app, close } = await createE2eApp('app'));
  });
  afterAll(() => close());

  describe('rutas abiertas', () => {
    it('GET / (el health check) responde sin token', async () => {
      const res = await request(server()).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toBe('GreenLight: $1.234.567');
    });
  });

  describe('todo lo demás pide token', () => {
    it.each([
      ['get', '/products'],
      ['get', '/accounts'],
      ['get', '/cards'],
      ['get', '/loans'],
      ['get', '/categories?kind=expense'],
      ['get', '/movements'],
      ['get', '/projection'],
      ['get', '/settings'],
      ['get', '/recurring-incomes'],
      ['get', '/fixed-expenses'],
      ['get', '/auth/me'],
      ['post', '/expenses'],
      ['post', '/simulations'],
      ['post', '/statement-checks'],
      ['post', '/capital-payments'],
      ['delete', '/products/1'],
    ] as const)('%s %s sin token: 401', async (method, path) => {
      const res = await request(server())[method](path);
      expect(res.status).toBe(401);
    });

    it('con un token falso: 401', async () => {
      const res = await request(server()).get('/projection').set('Authorization', 'Bearer abc.def.ghi');
      expect(res.status).toBe(401);
    });
  });

  describe('CORS', () => {
    const preflight = (origin: string) =>
      request(server())
        .options('/projection')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

    it('permite el encabezado Authorization desde la app web (localhost:8081)', async () => {
      const res = await preflight('http://localhost:8081');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
      expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
    });

    it('sigue sin abrirse a otros orígenes: nunca concede el ajeno ni "*"', async () => {
      // Con un origen fijo, la API responde siempre ese mismo; el navegador bloquea al sitio que no coincide
      const res = await preflight('http://sitio-ajeno.example');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
      expect(res.headers['access-control-allow-origin']).not.toBe('http://sitio-ajeno.example');
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });
});
