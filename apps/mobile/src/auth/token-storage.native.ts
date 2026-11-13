import * as SecureStore from 'expo-secure-store';

import { SESSION_KEY, type SessionStorage } from './storage-types';

/**
 * iOS y Android: el token va a SecureStore (Keychain en iOS, Keystore en Android), cifrado por el sistema y fuera del
 * alcance de otras apps. AsyncStorage guardaría el token en texto plano.
 */
export const sessionStorageImpl: SessionStorage = {
  async load() {
    try {
      return await SecureStore.getItemAsync(SESSION_KEY);
    } catch {
      // Si el almacén falla, es mejor pedir el login que quedarse atascada
      return null;
    }
  },
  async save(value) {
    await SecureStore.setItemAsync(SESSION_KEY, value);
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // Ya no está o no se pudo borrar: el estado en memoria es el que manda
    }
  },
};
