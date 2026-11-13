import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { INVITE_CODE } from './e2e-app';

/** Una persona que usa la API: su token y atajos para llamar con él. */
export interface Person {
  id: number;
  email: string;
  token: string;
  get: (path: string) => request.Test;
  post: (path: string, body?: object) => request.Test;
  patch: (path: string, body?: object) => request.Test;
  delete: (path: string) => request.Test;
}

export function personFor(app: INestApplication, id: number, email: string, token: string): Person {
  const http = () => app.getHttpServer() as Server;
  const auth = (t: request.Test) => t.set('Authorization', `Bearer ${token}`);
  return {
    id,
    email,
    token,
    get: (path) => auth(request(http()).get(path)),
    post: (path, body = {}) => auth(request(http()).post(path).send(body)),
    patch: (path, body = {}) => auth(request(http()).patch(path).send(body)),
    delete: (path) => auth(request(http()).delete(path)),
  };
}

/** Registra una cuenta por la API (con el código de invitación) y devuelve a la persona ya con sesión. */
export async function signUp(app: INestApplication, email: string, name = 'Prueba'): Promise<Person> {
  const res = await request(app.getHttpServer() as Server)
    .post('/auth/register')
    .send({ email, name, password: 'una-clave-larga-123', inviteCode: INVITE_CODE });
  if (res.status !== 201) throw new Error(`No se pudo registrar a ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const body = res.body as { accessToken: string; user: { id: number } };
  return personFor(app, body.user.id, email, body.accessToken);
}
