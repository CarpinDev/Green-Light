import {
  type AuthResponse,
  type AuthUser,
  type StoredSession,
  isSessionActive,
  parseStoredSession,
  serializeSession,
  toStoredSession,
} from './session';
import type { SessionStorage } from './storage-types';

// La lógica de la sesión sin React: qué pasa al abrir la app, al entrar, al registrarse y al salir.
// El AuthProvider es solo un envoltorio que la expone a las pantallas; así se puede probar sin renderizar nada.

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

export interface SignUpInput {
  email: string;
  name: string;
  password: string;
  inviteCode: string;
}

export interface AuthDeps {
  storage: SessionStorage;
  /** Al salir se vacía la caché de consultas: el siguiente usuario del teléfono no debe ver datos del anterior. */
  queryClient: { clear: () => void };
  /** Fija (o quita) el token que el cliente de la API manda en cada llamada. */
  setToken: (token: string | null) => void;
  /** POST a /auth/login o /auth/register. */
  request: (path: '/auth/login' | '/auth/register', body: object) => Promise<AuthResponse>;
  /** La hora actual; se inyecta para probar vencimientos. */
  now?: () => Date;
}

export interface AuthController {
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
  /** Al abrir la app: lee la sesión guardada y la usa si no ha vencido. */
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** La API respondió 401 con sesión: el token ya no sirve, se sale sin preguntar. */
  handleUnauthorized: () => void;
}

export function createAuthController(deps: AuthDeps): AuthController {
  const now = deps.now ?? (() => new Date());
  let state: AuthState = { status: 'loading', user: null };
  const listeners = new Set<() => void>();

  const setState = (next: AuthState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const begin = async (response: AuthResponse) => {
    const session: StoredSession = toStoredSession(response);
    deps.setToken(session.token);
    setState({ status: 'signedIn', user: session.user });
    try {
      await deps.storage.save(serializeSession(session));
    } catch {
      // Si no se puede guardar, la sesión dura hasta que se cierre la app: no es motivo para rechazar el login
    }
  };

  const signOut = async () => {
    // Primero lo que se ve y lo que se manda; el borrado del dispositivo puede tardar
    deps.setToken(null);
    setState({ status: 'signedOut', user: null });
    deps.queryClient.clear();
    await deps.storage.clear();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async restore() {
      const session = parseStoredSession(await deps.storage.load());
      if (session !== null && isSessionActive(session, now())) {
        deps.setToken(session.token);
        setState({ status: 'signedIn', user: session.user });
        return;
      }
      // Vencida, rota o inexistente: se borra lo que haya para no volver a leerla
      deps.setToken(null);
      if (session !== null) await deps.storage.clear();
      setState({ status: 'signedOut', user: null });
    },

    async signIn(email, password) {
      await begin(await deps.request('/auth/login', { email, password }));
    },

    async signUp(input) {
      await begin(await deps.request('/auth/register', input));
    },

    signOut,

    handleUnauthorized() {
      if (state.status === 'signedIn') void signOut();
    },
  };
}
