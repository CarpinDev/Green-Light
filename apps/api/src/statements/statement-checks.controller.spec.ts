import type { Server } from 'node:http';
import { ConflictException, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StatementChecksController } from './statement-checks.controller';
import { StatementChecksService } from './statement-checks.service';

// Sin base de datos: un StatementChecksService falso. Prueba la ruta, el código HTTP y la validación.

describe('POST /statement-checks', () => {
  let app: INestApplication;
  const create = jest.fn();
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StatementChecksController],
      providers: [{ provide: StatementChecksService, useValue: { create } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => create.mockReset());

  const body = { cardId: 1, cutDate: '2026-03-15', statementMinimumCents: 48_000_000 };

  it('responde 201 (aquí sí guarda) con lo que devuelve el service', async () => {
    create.mockResolvedValue({ id: 7 });
    const res = await request(server()).post('/statement-checks').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining(body));
  });

  it('un cuerpo inválido es 400 y no llega al service', async () => {
    const res = await request(server())
      .post('/statement-checks')
      .send({ ...body, statementMinimumCents: -1 });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('un corte ya validado llega como 409', async () => {
    create.mockRejectedValue(new ConflictException('ya lo validaste'));
    const res = await request(server()).post('/statement-checks').send(body);
    expect(res.status).toBe(409);
  });
});
