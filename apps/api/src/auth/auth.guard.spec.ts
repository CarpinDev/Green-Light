import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, bearerToken } from './auth.guard';
import type { AuthenticatedRequest } from './current-user.decorator';
import { Public } from './public.decorator';

// El guard global: lo único que decide quién entra. Se prueba con tokens firmados de verdad (sin base de datos).

const SECRET = 'un-secreto-de-prueba-de-al-menos-32-caracteres';

/** Un controller de mentira con una ruta abierta y una cerrada, para que Reflector lea metadatos reales. */
class Dummy {
  @Public()
  open() {}
  closed() {}
}
@Public()
class OpenController {
  anything() {}
}

/** El método de una clase tal como lo ve Reflector (la función que lleva los metadatos). */
function handlerOf(cls: new () => object, name: string): () => void {
  return Object.getOwnPropertyDescriptor(cls.prototype, name)?.value as () => void;
}

function contextFor(handler: () => void, controller: new () => object, authorization?: string) {
  const request: AuthenticatedRequest = { headers: authorization === undefined ? {} : { authorization } } as never;
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  });
  const guard = new AuthGuard(jwt, new Reflector());
  const closed = handlerOf(Dummy, 'closed');

  const tokenFor = (sub = 7, options: Parameters<JwtService['signAsync']>[1] = { expiresIn: '1h' }) =>
    jwt.signAsync({ sub, email: 'ana@example.com' }, options);

  describe('rutas abiertas (@Public)', () => {
    it('deja pasar una ruta marcada, sin token', async () => {
      const { context } = contextFor(handlerOf(Dummy, 'open'), Dummy);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('@Public() en un controller abre todas sus rutas', async () => {
      const { context } = contextFor(handlerOf(OpenController, 'anything'), OpenController);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('no deja usuario en el request: nadie inició sesión', async () => {
      const { context, request } = contextFor(handlerOf(Dummy, 'open'), Dummy);
      await guard.canActivate(context);
      expect(request.user).toBeUndefined();
    });
  });

  describe('rutas cerradas', () => {
    it('sin encabezado Authorization: 401', async () => {
      const { context } = contextFor(closed, Dummy);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it.each(['', 'Bearer', 'Bearer ', 'Basic abc', 'abc.def.ghi', 'Bearer a b'])(
      'encabezado mal formado %p: 401',
      async (header) => {
        const { context } = contextFor(closed, Dummy, header);
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      },
    );

    it('un token firmado con otro secreto: 401', async () => {
      const other = new JwtService({ secret: 'otro-secreto-distinto-de-al-menos-32-caracteres' });
      const forged = await other.signAsync({ sub: 7, email: 'ana@example.com' }, { expiresIn: '1h' });
      const { context } = contextFor(closed, Dummy, `Bearer ${forged}`);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('un token vencido: 401', async () => {
      const expired = await tokenFor(7, { expiresIn: -60 });
      const { context } = contextFor(closed, Dummy, `Bearer ${expired}`);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('un token alterado (otro usuario en el cuerpo): 401', async () => {
      const [header, , signature] = (await tokenFor(7)).split('.');
      const body = Buffer.from(JSON.stringify({ sub: 1, email: 'otra@example.com', exp: 9999999999 })).toString(
        'base64url',
      );
      const { context } = contextFor(closed, Dummy, `Bearer ${header}.${body}.${signature}`);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('un token con alg "none" (sin firma): 401', async () => {
      const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const unsigned = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: 7, email: 'ana@example.com' })}.`;
      const { context } = contextFor(closed, Dummy, `Bearer ${unsigned}`);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('el 401 no dice por qué (vencido, falsificado...) para no ayudar a quien ataca', async () => {
      const expired = await tokenFor(7, { expiresIn: -60 });
      const { context } = contextFor(closed, Dummy, `Bearer ${expired}`);
      await expect(guard.canActivate(context)).rejects.toThrow('Tu sesión no es válida o venció');
    });

    it('un token válido pasa y deja el id y el email en el request', async () => {
      const { context, request } = contextFor(closed, Dummy, `Bearer ${await tokenFor(7)}`);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({ id: 7, email: 'ana@example.com' });
    });

    it('"bearer" en minúsculas también vale', async () => {
      const { context } = contextFor(closed, Dummy, `bearer ${await tokenFor(7)}`);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});

describe('bearerToken', () => {
  it('saca el token de "Bearer <token>"', () => expect(bearerToken('Bearer abc')).toBe('abc'));
  it('sin encabezado, undefined', () => expect(bearerToken(undefined)).toBeUndefined());
  it('con otro esquema, undefined', () => expect(bearerToken('Basic abc')).toBeUndefined());
});
