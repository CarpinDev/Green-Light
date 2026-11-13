// El contrato del almacén de la sesión y su versión en memoria. Sin código de plataforma: lo importan las versiones
// de cada plataforma (token-storage.native.ts, token-storage.web.ts) y las pruebas.

export interface SessionStorage {
  /** El texto guardado, o null si no hay nada (o no se pudo leer: sin sesión es lo más seguro). */
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  clear(): Promise<void>;
}

/** La llave bajo la que se guarda la sesión. SecureStore solo admite letras, números, ".", "-" y "_". */
export const SESSION_KEY = 'greenlight.session';

/** En memoria: se pierde al cerrar la app. Para pruebas y como reserva. */
export function createMemoryStorage(initial: string | null = null): SessionStorage {
  let value = initial;
  return {
    load: () => Promise.resolve(value),
    save: (next) => {
      value = next;
      return Promise.resolve();
    },
    clear: () => {
      value = null;
      return Promise.resolve();
    },
  };
}
