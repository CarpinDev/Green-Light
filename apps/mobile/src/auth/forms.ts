import { ApiError } from '@/api/client';
import { errorText } from '@/api/errors';

// Validación y mensajes de los formularios de entrada. Puro.

export const MIN_PASSWORD_LENGTH = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El primer problema de un inicio de sesión, o null si se puede enviar. */
export function validateLogin(input: { email: string; password: string }): string | null {
  if (!EMAIL.test(input.email.trim())) return 'Escribe un email válido.';
  if (input.password === '') return 'Escribe tu contraseña.';
  return null;
}

/** El primer problema de un registro, o null si se puede enviar. */
export function validateRegister(input: {
  name: string;
  email: string;
  password: string;
  inviteCode: string;
}): string | null {
  if (input.name.trim() === '') return 'Escribe tu nombre.';
  if (!EMAIL.test(input.email.trim())) return 'Escribe un email válido.';
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (input.inviteCode.trim() === '') return 'Escribe el código de invitación.';
  return null;
}

/** El texto de un error de login o registro. Un 429 es el límite de intentos de la API. */
export function authErrorText(error: Error): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
  }
  return errorText(error);
}
