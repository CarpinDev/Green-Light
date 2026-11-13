import type { Server } from 'node:http';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { fakeAuth } from '../testing/fake-auth';
import { USER } from '../testing/users';

// Sin base de datos: un CategoriesService falso. Prueba GET /categories y la validación de ?kind.

describe('GET /categories', () => {
  let app: INestApplication;
  const list = jest.fn();
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [fakeAuth, { provide: CategoriesService, useValue: { list } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => list.mockReset());

  it('con kind=expense responde 200 con lo que devuelve el service', async () => {
    list.mockResolvedValue([{ id: 10, name: 'Mercado' }]);
    const res = await request(server()).get('/categories?kind=expense');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 10, name: 'Mercado' }]);
    expect(list).toHaveBeenCalledWith(USER, 'expense');
  });

  it('también acepta income', async () => {
    list.mockResolvedValue([]);
    expect((await request(server()).get('/categories?kind=income')).status).toBe(200);
    expect(list).toHaveBeenCalledWith(USER, 'income');
  });

  it('un kind inventado es 400 y no llega al service', async () => {
    expect((await request(server()).get('/categories?kind=otro')).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('sin kind también es 400', async () => {
    expect((await request(server()).get('/categories')).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('un parámetro de más es 400', async () => {
    expect((await request(server()).get('/categories?kind=expense&color=azul')).status).toBe(400);
  });
});
