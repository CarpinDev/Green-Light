import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError, deleteJson, getJson, patchJson } from '@/api/client';

// El cliente contra un fetch falso: lo que importa es cómo lee (o no lee) la respuesta.

const reply = (init: { status: number; body?: unknown }) =>
  ({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: '',
    json: jest.fn(async () => {
      if (init.body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return init.body;
    }),
  }) as unknown as Response;

function mockFetch(response: Response) {
  const fetchMock = jest.fn<typeof fetch>(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteJson', () => {
  it('un 204 sin cuerpo no falla: no intenta leer JSON', async () => {
    const response = reply({ status: 204 });
    const fetchMock = mockFetch(response);

    await expect(deleteJson('/fixed-expenses/3')).resolves.toBeUndefined();

    expect(response.json).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/fixed-expenses/3'), { method: 'DELETE' });
  });

  it('un 404 lanza un ApiError con el mensaje de Nest', async () => {
    mockFetch(reply({ status: 404, body: { message: 'El gasto fijo 3 no existe' } }));
    await expect(deleteJson('/fixed-expenses/3')).rejects.toMatchObject({
      status: 404,
      message: 'El gasto fijo 3 no existe',
    });
  });
});

describe('patchJson', () => {
  it('manda PATCH con el cuerpo en JSON y devuelve la respuesta', async () => {
    const fetchMock = mockFetch(reply({ status: 200, body: { id: 7 } }));

    await expect(patchJson('/recurring-incomes/7', { endDate: null })).resolves.toEqual({ id: 7 });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/recurring-incomes/7'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"endDate":null}',
    });
  });

  it('un 400 de validación une la lista de mensajes', async () => {
    mockFetch(reply({ status: 400, body: { message: ['property amountCents should not exist', 'otro'] } }));
    const error = await patchJson('/recurring-incomes/7', { amountCents: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('property amountCents should not exist, otro');
  });
});

describe('getJson', () => {
  it('sigue leyendo el JSON de un 200', async () => {
    mockFetch(reply({ status: 200, body: [{ id: 1 }] }));
    await expect(getJson('/fixed-expenses')).resolves.toEqual([{ id: 1 }]);
  });
});
