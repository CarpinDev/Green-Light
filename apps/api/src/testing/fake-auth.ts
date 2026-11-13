import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/current-user.decorator';
import { USER } from './users';

/**
 * Para las pruebas de controllers que no tratan de autenticación: deja pasar todo y pone a USER como el usuario de
 * la petición, igual que haría el guard real tras verificar un token. Así `@CurrentUser()` funciona sin firmar nada.
 * El guard real tiene sus propias pruebas (auth.guard.spec.ts).
 */
@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = { id: USER, email: 'usuaria@example.com' };
    return true;
  }
}

/** Se agrega a `providers` del módulo de prueba: `providers: [fakeAuth, ...]`. */
export const fakeAuth = { provide: APP_GUARD, useClass: FakeAuthGuard };
