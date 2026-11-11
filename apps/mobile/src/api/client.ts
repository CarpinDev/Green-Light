/** Dirección de la API: sale de EXPO_PUBLIC_API_URL (apps/mobile/.env). */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Un error de la API: guarda el status HTTP y el mensaje que mandó Nest. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** GET a la API y devuelve el JSON. Si la respuesta no es ok, lanza un ApiError con el status y el message de Nest. */
export async function getJson<T>(path: string): Promise<T> {
  return send<T>(path);
}

/** POST con un cuerpo JSON. Los errores se manejan igual que en getJson (un 400 de validación trae una lista unida con comas). */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) throw new ApiError(response.status, await messageOf(response));
  return (await response.json()) as T;
}

/** Nest responde { message, error, statusCode }; message puede ser un texto o una lista (validación). */
async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // La respuesta no era JSON: se cae al texto genérico
  }
  return response.statusText || `Error ${response.status}`;
}
