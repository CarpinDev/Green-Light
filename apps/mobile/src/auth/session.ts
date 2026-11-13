// La sesión guardada en el dispositivo, y cuándo sigue valiendo. Puro: la hora llega como parámetro.

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

/** Lo que responden POST /auth/login y POST /auth/register. */
export interface AuthResponse {
  accessToken: string;
  /** ISO 8601: cuándo vence el token. */
  expiresAt: string;
  user: AuthUser;
}

/** Lo que se guarda: el token con su vencimiento y quién es. */
export interface StoredSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export function toStoredSession(response: AuthResponse): StoredSession {
  return { token: response.accessToken, expiresAt: response.expiresAt, user: response.user };
}

/**
 * ¿La sesión sigue vigente en `now`? Un token vencido no se manda: la API lo rechazaría de todos modos, y así la
 * app va directo al login en vez de mostrar un error en la primera pantalla. Una fecha ilegible cuenta como vencida.
 */
export function isSessionActive(session: StoredSession, now: Date): boolean {
  const expires = new Date(session.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

/** Lo que se guardó, de vuelta a una sesión. Cualquier cosa rara (vacío, JSON roto, campos que faltan) es null. */
export function parseStoredSession(raw: string | null): StoredSession | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession> | null;
    const user = value?.user;
    if (
      typeof value?.token !== 'string' ||
      value.token === '' ||
      typeof value.expiresAt !== 'string' ||
      typeof user?.id !== 'number' ||
      typeof user.email !== 'string' ||
      typeof user.name !== 'string'
    ) {
      return null;
    }
    return {
      token: value.token,
      expiresAt: value.expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    };
  } catch {
    return null;
  }
}

export function serializeSession(session: StoredSession): string {
  return JSON.stringify(session);
}
