import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { postJson, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { type AuthController, type AuthState, type SignUpInput, createAuthController } from './auth-controller';
import type { AuthResponse } from './session';
import { sessionStorageImpl } from './token-storage';

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Da a las pantallas el estado de la sesión (`loading`, `signedOut`, `signedIn`), el usuario y signIn / signUp /
 * signOut. Va DENTRO del QueryClientProvider: al salir vacía esa caché. Toda la lógica está en createAuthController.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const controller = useMemo<AuthController>(
    () =>
      createAuthController({
        storage: sessionStorageImpl,
        queryClient,
        setToken: setAuthToken,
        request: (path, body) => postJson<AuthResponse>(path, body),
      }),
    [queryClient],
  );

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    // Si la API rechaza el token en cualquier llamada, se sale: el guard del layout lleva al login
    setUnauthorizedHandler(controller.handleUnauthorized);
    void controller.restore();
    return () => setUnauthorizedHandler(null);
  }, [controller]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn: controller.signIn, signUp: controller.signUp, signOut: controller.signOut }),
    [state, controller],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth se usó fuera del AuthProvider');
  return value;
}
