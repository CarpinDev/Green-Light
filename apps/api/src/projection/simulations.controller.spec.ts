import { ConflictException, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { SimulationsController } from './simulations.controller';
import { SimulationsService } from './simulations.service';
import { fakeAuth } from '../testing/fake-auth';
import { USER } from '../testing/users';

// Sin base de datos: un SimulationsService falso. Prueba la ruta, el código HTTP y la validación.

describe('POST /simulations', () => {
  let app: INestApplication;
  const simulate = jest.fn();
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SimulationsController],
      providers: [fakeAuth, { provide: SimulationsService, useValue: { simulate } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => simulate.mockReset());

  const body = { cardId: 1, amountCents: 120_000_000, installments: 3 };

  it('responde 200 (no crea nada) con lo que devuelve el service', async () => {
    simulate.mockResolvedValue({ asOf: '2026-03-10' });
    const res = await request(server()).post('/simulations').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asOf: '2026-03-10' });
    expect(simulate).toHaveBeenCalledWith(USER, expect.objectContaining(body));
  });

  it('un cuerpo inválido es 400 y no llega al service', async () => {
    const res = await request(server())
      .post('/simulations')
      .send({ ...body, installments: 0 });
    expect(res.status).toBe(400);
    expect(simulate).not.toHaveBeenCalled();
  });

  it('un 409 del service (saldo viejo) llega como 409', async () => {
    simulate.mockRejectedValue(new ConflictException('Tu último saldo es del 2026-01-01, confírmalo para proyectar'));
    const res = await request(server()).post('/simulations').send(body);
    expect(res.status).toBe(409);
  });
});
