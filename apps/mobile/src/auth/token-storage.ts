// Dónde se guarda la sesión en el dispositivo. Hay una versión por plataforma, y Metro elige sola:
//   token-storage.native.ts  iOS y Android: expo-secure-store (Keychain / Keystore, cifrado por el sistema)
//   token-storage.web.ts     navegador: sessionStorage
// Esta es la reserva para cualquier otra plataforma (en memoria) y la que TypeScript ve al comprobar los tipos.

import { createMemoryStorage } from './storage-types';

export const sessionStorageImpl = createMemoryStorage();
