import { SESSION_KEY, type SessionStorage, createMemoryStorage } from './storage-types';

/**
 * Navegador: expo-secure-store no existe en web, así que va a sessionStorage. Se eligió sessionStorage y no
 * localStorage a propósito: se borra al cerrar la pestaña, así que un token olvidado no queda en un computador
 * compartido para siempre. Ninguno de los dos está a salvo de un script malicioso en la página (XSS), y por eso
 * la sesión web dura lo que dura la pestaña; el costo es volver a iniciar sesión al abrir una pestaña nueva.
 */
function browserStorage(): Storage | null {
  try {
    // En modo privado o con datos de sitio bloqueados, incluso leer window.sessionStorage puede lanzar
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const fallback = createMemoryStorage();

export const sessionStorageImpl: SessionStorage = {
  async load() {
    try {
      return browserStorage()?.getItem(SESSION_KEY) ?? (await fallback.load());
    } catch {
      return null;
    }
  },
  async save(value) {
    try {
      const storage = browserStorage();
      if (storage === null) return fallback.save(value);
      storage.setItem(SESSION_KEY, value);
    } catch {
      // Sin almacenamiento: la sesión vive solo en memoria hasta recargar
      await fallback.save(value);
    }
  },
  async clear() {
    await fallback.clear();
    try {
      browserStorage()?.removeItem(SESSION_KEY);
    } catch {
      // Nada que borrar
    }
  },
};
