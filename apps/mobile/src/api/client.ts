/** Dirección de la API: sale de EXPO_PUBLIC_API_URL (apps/mobile/.env). */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// El token de la sesión y qué hacer si la API lo rechaza. Viven aquí, en memoria, porque toda llamada pasa por
// este archivo; quien los fija es el AuthProvider (ver auth/auth-controller.ts).
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Con token, cada llamada manda `Authorization: Bearer <token>`. Con null, ninguna lo manda. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Qué hacer cuando la API responde 401 a una llamada con sesión (el token venció o ya no vale). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** El inicio de sesión y el registro responden 401/403 por datos malos, no porque la sesión haya vencido. */
const PUBLIC_PATHS = ['/auth/login', '/auth/register'];

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

/** PATCH con un cuerpo JSON: edita solo los campos que se mandan. */
export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETE: la API responde 204 sin cuerpo, así que no devuelve nada. */
export async function deleteJson(path: string): Promise<void> {
  await send<void>(path, { method: 'DELETE' });
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  // Sin token la llamada sale exactamente como la armó quien la pidió
  const withAuth: RequestInit | undefined =
    authToken === null ? init : { ...init, headers: { ...init?.headers, Authorization: `Bearer ${authToken}` } };
  const response = await fetch(`${BASE_URL}${path}`, withAuth);
  if (!response.ok) {
    // Un 401 con sesión: el token ya no sirve. Se avisa para volver al login (no en el login mismo)
    if (response.status === 401 && authToken !== null && !PUBLIC_PATHS.includes(path)) onUnauthorized?.();
    throw new ApiError(response.status, await messageOf(response));
  }
  // 204 No Content (un DELETE): no hay cuerpo, y response.json() fallaría
  if (response.status === 204) return undefined as T;
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
