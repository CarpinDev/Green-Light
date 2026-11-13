import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError, deleteJson, getJson, postJson, setAuthToken, setUnauthorizedHandler } from '@/api/client';

// El cliente con sesión: manda el token en cada llamada y avisa cuando la API lo rechaza. fetch falso.

const reply = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: jest.fn(async () => {
      if (body === undefined) throw new SyntaxError('sin cuerpo');
      return body;
    }),
  }) as unknown as Response;

function mockFetch(response: Response) {
  const fetchMock = jest.fn<typeof fetch>(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Los headers de la última llamada a fetch. */
const headersOf = (fetchMock: jest.Mock<typeof fetch>): Record<string, string> =>
  ((fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;

afterEach(() => {
  setAuthToken(null);
  setUnauthorizedHandler(null);
  jest.restoreAllMocks();
});

describe('Authorization', () => {
  it('con token, un GET manda "Bearer <token>"', async () => {
    const fetchMock = mockFetch(reply(200, []));
    setAuthToken('abc.def.ghi');
    await getJson('/products');
    expect(headersOf(fetchMock)).toEqual({ Authorization: 'Bearer abc.def.ghi' });
  });

  it('con token, un POST manda el token Y conserva su Content-Type y su cuerpo', async () => {
    const fetchMock = mockFetch(reply(201, { id: 1 }));
    setAuthToken('abc.def.ghi');
    await postJson('/expenses', { amountCents: 100 });
    expect(headersOf(fetchMock)).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer abc.def.ghi' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/expenses'),
      expect.objectContaining({ method: 'POST', body: '{"amountCents":100}' }),
    );
  });

  it('un DELETE también lo manda', async () => {
    const fetchMock = mockFetch(reply(204));
    setAuthToken('abc.def.ghi');
    await deleteJson('/products/3');
    expect(headersOf(fetchMock)).toEqual({ Authorization: 'Bearer abc.def.ghi' });
  });

  it('sin token no agrega ningún encabezado', async () => {
    const fetchMock = mockFetch(reply(200, []));
    await getJson('/products');
    expect(headersOf(fetchMock)).toEqual({});
  });

  it('tras setAuthToken(null) deja de mandarlo', async () => {
    const fetchMock = mockFetch(reply(200, []));
    setAuthToken('abc.def.ghi');
    setAuthToken(null);
    await getJson('/products');
    expect(headersOf(fetchMock)).toEqual({});
  });

  it('un token nuevo reemplaza al anterior', async () => {
    const fetchMock = mockFetch(reply(200, []));
    setAuthToken('primero');
    setAuthToken('segundo');
    await getJson('/products');
    expect(headersOf(fetchMock).Authorization).toBe('Bearer segundo');
  });
});

describe('un 401', () => {
  it('con sesión: avisa una vez y el error sigue llegando a quien llamó', async () => {
    mockFetch(reply(401, { message: 'Tu sesión no es válida o venció' }));
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('vencido');

    const error = await getJson('/projection').catch((e: unknown) => e);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'Tu sesión no es válida o venció' });
  });

  it('en el login NO cuenta: una contraseña mala es un 401 normal, no una sesión vencida', async () => {
    mockFetch(reply(401, { message: 'Email o contraseña incorrectos' }));
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('abc');

    await postJson('/auth/login', { email: 'a@b.c', password: 'x' }).catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('sin token no avisa (nadie había iniciado sesión)', async () => {
    mockFetch(reply(401, { message: 'Inicia sesión para continuar' }));
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await getJson('/projection').catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 429, 500])('un %i no se toma por sesión vencida', async (status) => {
    mockFetch(reply(status, { message: 'x' }));
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken('abc');

    await getJson('/projection').catch(() => undefined);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('sin manejador registrado, solo lanza el error (no se rompe)', async () => {
    mockFetch(reply(401, { message: 'x' }));
    setAuthToken('abc');
    await expect(getJson('/projection')).rejects.toMatchObject({ status: 401 });
  });
});
