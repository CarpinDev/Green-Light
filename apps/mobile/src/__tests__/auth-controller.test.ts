import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { createAuthController } from '@/auth/auth-controller';
import { type AuthResponse, type StoredSession, serializeSession } from '@/auth/session';
import { createMemoryStorage } from '@/auth/storage-types';

// El controlador de la sesión con almacén, caché y API falsos: qué pasa al abrir la app, entrar y salir.

const NOW = new Date('2026-11-12T12:00:00.000Z');
const USER = { id: 7, email: 'ana@example.com', name: 'Ana' };

const stored = (expiresAt: string): StoredSession => ({ token: 'guardado', expiresAt, user: USER });
const response = (token = 'nuevo'): AuthResponse => ({
  accessToken: token,
  expiresAt: '2026-12-12T12:00:00.000Z',
  user: USER,
});

function setup(initial: string | null = null) {
  const storage = createMemoryStorage(initial);
  const queryClient = new QueryClient();
  const setToken = jest.fn<(token: string | null) => void>();
  const request = jest.fn<(path: '/auth/login' | '/auth/register', body: object) => Promise<AuthResponse>>();
  request.mockResolvedValue(response());
  const controller = createAuthController({ storage, queryClient, setToken, request, now: () => NOW });
  return { controller, storage, queryClient, setToken, request };
}

describe('al abrir la app (restore)', () => {
  it('empieza en "loading": todavía no se sabe', () => {
    expect(setup().controller.getState()).toEqual({ status: 'loading', user: null });
  });

  it('con una sesión vigente: entra directo y le pasa el token al cliente', async () => {
    const { controller, setToken } = setup(serializeSession(stored('2026-12-12T12:00:00.000Z')));
    await controller.restore();
    expect(controller.getState()).toEqual({ status: 'signedIn', user: USER });
    expect(setToken).toHaveBeenCalledWith('guardado');
  });

  it('con una sesión vencida: pide login, no manda el token y borra lo guardado', async () => {
    const { controller, setToken, storage } = setup(serializeSession(stored('2026-11-11T12:00:00.000Z')));
    await controller.restore();
    expect(controller.getState()).toEqual({ status: 'signedOut', user: null });
    expect(setToken).not.toHaveBeenCalledWith('guardado');
    expect(setToken).toHaveBeenLastCalledWith(null);
    expect(await storage.load()).toBeNull();
  });

  it('sin nada guardado: pide login', async () => {
    const { controller } = setup();
    await controller.restore();
    expect(controller.getState().status).toBe('signedOut');
  });

  it('con algo ilegible guardado: pide login y lo borra', async () => {
    const { controller, storage } = setup('{esto no es una sesión');
    await controller.restore();
    expect(controller.getState().status).toBe('signedOut');
    expect(await storage.load()).toBe('{esto no es una sesión');
  });
});

describe('signIn y signUp', () => {
  it('signIn llama a /auth/login, guarda la sesión y deja el token en el cliente', async () => {
    const { controller, request, setToken, storage } = setup();
    await controller.signIn('ana@example.com', 'una-clave-larga-123');

    expect(request).toHaveBeenCalledWith('/auth/login', { email: 'ana@example.com', password: 'una-clave-larga-123' });
    expect(setToken).toHaveBeenCalledWith('nuevo');
    expect(controller.getState()).toEqual({ status: 'signedIn', user: USER });
    expect(JSON.parse((await storage.load()) ?? '{}')).toMatchObject({ token: 'nuevo', user: USER });
  });

  it('signUp llama a /auth/register con todos los campos', async () => {
    const { controller, request } = setup();
    const input = { email: 'ana@example.com', name: 'Ana', password: 'una-clave-larga-123', inviteCode: 'codigo' };
    await controller.signUp(input);
    expect(request).toHaveBeenCalledWith('/auth/register', input);
    expect(controller.getState().status).toBe('signedIn');
  });

  it('si la API rechaza (401, 403, 409...), el error se propaga y no queda sesión', async () => {
    const { controller, request, setToken, storage } = setup();
    request.mockRejectedValue(new Error('Email o contraseña incorrectos'));

    await expect(controller.signIn('ana@example.com', 'mala')).rejects.toThrow('Email o contraseña incorrectos');

    expect(controller.getState().status).not.toBe('signedIn');
    expect(setToken).not.toHaveBeenCalled();
    expect(await storage.load()).toBeNull();
  });

  it('si no se puede guardar la sesión, igual entra (dura hasta cerrar la app)', async () => {
    const { controller, storage } = setup();
    storage.save = () => Promise.reject(new Error('almacén lleno'));
    await controller.signIn('ana@example.com', 'una-clave-larga-123');
    expect(controller.getState().status).toBe('signedIn');
  });
});

describe('signOut', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await ctx.controller.signIn('ana@example.com', 'una-clave-larga-123');
    // Datos de Ana en la caché de consultas
    ctx.queryClient.setQueryData(['projection'], { months: [1, 2, 3] });
    ctx.queryClient.setQueryData(['products'], [{ id: 1 }]);
  });

  it('vacía la caché: el siguiente usuario del teléfono no ve los datos del anterior', async () => {
    expect(ctx.queryClient.getQueryData(['projection'])).toBeDefined();

    await ctx.controller.signOut();

    expect(ctx.queryClient.getQueryData(['projection'])).toBeUndefined();
    expect(ctx.queryClient.getQueryData(['products'])).toBeUndefined();
    expect(ctx.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('borra el token del cliente y la sesión del dispositivo', async () => {
    await ctx.controller.signOut();
    expect(ctx.setToken).toHaveBeenLastCalledWith(null);
    expect(await ctx.storage.load()).toBeNull();
  });

  it('el estado pasa a "signedOut" sin usuario', async () => {
    await ctx.controller.signOut();
    expect(ctx.controller.getState()).toEqual({ status: 'signedOut', user: null });
  });

  it('aun si falla borrar del dispositivo, ya no hay sesión ni datos en memoria', async () => {
    ctx.storage.clear = () => Promise.reject(new Error('no se pudo'));
    await expect(ctx.controller.signOut()).rejects.toThrow('no se pudo');
    expect(ctx.controller.getState().status).toBe('signedOut');
    expect(ctx.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(ctx.setToken).toHaveBeenLastCalledWith(null);
  });
});

describe('handleUnauthorized (la API rechazó el token)', () => {
  it('con sesión: sale, vacía la caché y quita el token', async () => {
    const { controller, queryClient, setToken, storage } = setup();
    await controller.signIn('ana@example.com', 'una-clave-larga-123');
    queryClient.setQueryData(['projection'], { months: [] });

    controller.handleUnauthorized();
    await Promise.resolve();

    expect(controller.getState().status).toBe('signedOut');
    expect(queryClient.getQueryData(['projection'])).toBeUndefined();
    expect(setToken).toHaveBeenLastCalledWith(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(await storage.load()).toBeNull();
  });

  it('sin sesión no hace nada (varias llamadas fallando a la vez no repiten la salida)', async () => {
    const { controller, setToken } = setup();
    await controller.restore();
    setToken.mockClear();

    controller.handleUnauthorized();

    expect(setToken).not.toHaveBeenCalled();
  });
});

describe('subscribe', () => {
  it('avisa en cada cambio de estado y deja de avisar al darse de baja', async () => {
    const { controller } = setup();
    const listener = jest.fn();
    const unsubscribe = controller.subscribe(listener);

    await controller.signIn('ana@example.com', 'una-clave-larga-123');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await controller.signOut();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
