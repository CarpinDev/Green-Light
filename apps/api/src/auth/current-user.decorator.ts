import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Lo que el guard deja pegado al request tras verificar el token. */
export interface AuthenticatedUser {
  id: number;
  email: string;
}
export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Entrega el id del usuario que hizo la petición: `@CurrentUser() userId: number`.
 *
 * Es un decorador de PARÁMETRO, distinto de @Public(): aquel pega una etiqueta a una ruta para que otro la lea;
 * este se ejecuta en cada petición y calcula el valor del argumento de ese método (createParamDecorator).
 * El id viene del token ya verificado por el guard, nunca del cuerpo ni de la URL: nadie puede pedir "ser" otro.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): number => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    // No debería pasar: el guard global rechaza antes. Si pasa, es una ruta sin guard y mejor fallar fuerte.
    throw new Error('@CurrentUser() se usó en una ruta sin sesión: ¿falta el guard?');
  }
  return request.user.id;
});
