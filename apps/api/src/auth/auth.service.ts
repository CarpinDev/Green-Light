import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { User } from '../users/entities/user.entity';
import { type PublicUser, UsersService, toPublicUser } from '../users/users.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

/** La respuesta del login y del registro: el token, cuándo vence y quién es. */
export interface Session {
  accessToken: string;
  /** ISO 8601. La app lo guarda junto al token para no mandar uno vencido. */
  expiresAt: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  /**
   * Un hash de una contraseña al azar, calculado una vez con los mismos parámetros que uno real. Se usa cuando el
   * email no existe, para que el login tarde lo mismo que con un email real (ver `login`).
   */
  private readonly fakeHash: Promise<string> = argon2.hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Crea la cuenta si el código de invitación es el correcto. 403 con otro código; 409 si el email ya existe. */
  async register(dto: RegisterDto): Promise<Session> {
    // Primero el código: sin él ni siquiera se revela si un email ya está registrado
    if (!sameSecret(dto.inviteCode, this.config.getOrThrow<string>('INVITE_CODE'))) {
      throw new ForbiddenException('Código de invitación incorrecto');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    return this.session(user);
  }

  /**
   * Un 401 genérico tanto si el email no existe como si la contraseña está mal. Y se hace siempre un
   * argon2.verify, aunque el usuario no exista (contra un hash falso): argon2 tarda decenas de milisegundos y,
   * si solo se verificara con emails reales, esa diferencia de tiempo delataría cuáles están registrados.
   */
  async login(dto: LoginDto): Promise<Session> {
    const user = await this.users.findByEmail(dto.email);
    const hash = user?.passwordHash ?? (await this.fakeHash);
    // verify lanza si el hash está corrupto: eso también es "no coincide"
    const matches = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !matches) throw new UnauthorizedException('Email o contraseña incorrectos');
    return this.session(user);
  }

  /** Quién es el dueño del token. 401 si el usuario ya no existe (se borró después de emitir el token). */
  async me(userId: number): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Tu sesión no es válida o venció');
    return toPublicUser(user);
  }

  private async session(user: User): Promise<Session> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    // exp viene en segundos desde 1970
    const decoded = this.jwt.decode<{ exp: number }>(accessToken);
    return { accessToken, expiresAt: new Date(decoded.exp * 1000).toISOString(), user: toPublicUser(user) };
  }
}

/**
 * Compara dos secretos en tiempo constante. timingSafeEqual exige buffers del mismo largo, así que se comparan sus
 * hashes SHA-256 (siempre de 32 bytes); un `===` filtraría, por el tiempo que tarda, cuántos caracteres acertó.
 */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
