import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Lo que va dentro del token: `sub` (subject) es el nombre estándar del id del dueño. */
export interface JwtPayload {
  sub: number;
  email: string;
}

/**
 * Guard global: todas las rutas piden un token salvo las marcadas con @Public().
 *
 * Un guard es una clase con canActivate(): Nest la llama antes de cada ruta y, si devuelve false o lanza, la ruta
 * no se ejecuta. Se registra con APP_GUARD (ver AuthModule) para que valga para toda la aplicación sin repetirlo.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    // Reflector lee los metadatos que dejaron decoradores como @Public()
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // getAllAndOverride mira primero el método y luego la clase: @Public() en un método abre solo esa ruta,
    // en el controller abre todas. El primero que encuentre manda.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (token === undefined) throw new UnauthorizedException('Inicia sesión para continuar');

    try {
      // verifyAsync comprueba la firma y la expiración; lanza si algo falla
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      // Sin detalles: distinguir "vencido" de "falsificado" solo ayuda a quien ataca
      throw new UnauthorizedException('Tu sesión no es válida o venció');
    }
    return true;
  }
}

/** "Bearer abc.def.ghi" -> "abc.def.ghi"; undefined si falta o tiene otra forma. */
export function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) return undefined;
  return token;
}
