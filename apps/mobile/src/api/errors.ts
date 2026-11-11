import { ApiError } from '@/api/client';
import { formatDay } from '@/dates';

/** Un 409 con "confírmalo" es el saldo viejo: la solución es confirmarlo, no reintentar. */
export function isStaleBalance(error: Error): boolean {
  return error instanceof ApiError && error.status === 409 && /confírmalo/i.test(error.message);
}

/** El texto de un error para mostrarlo: el message de la API, o un aviso de conexión. */
export function errorText(error: Error): string {
  if (isStaleBalance(error)) {
    // El mensaje trae la fecha: "Tu último saldo es del 2026-10-02, confírmalo para proyectar"
    const date = /\d{4}-\d{2}-\d{2}/.exec(error.message)?.[0];
    return date ? `Tu saldo es del ${formatDay(date)}, confírmalo.` : error.message;
  }
  return error instanceof ApiError ? error.message : 'No hay conexión con la API. ¿Está corriendo?';
}
