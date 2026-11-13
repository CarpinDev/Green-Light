import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Intentos por minuto (por IP) en el login y el registro. AUTH_RATE_LIMIT lo cambia (las pruebas lo suben). */
const DEFAULT_ATTEMPTS_PER_MINUTE = 5;

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // HS256 fijo al firmar y al verificar: así un token con otro algoritmo (o "none") se rechaza
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '30d') as JwtSignOptions['expiresIn'],
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: Number(config.get('AUTH_RATE_LIMIT') ?? DEFAULT_ATTEMPTS_PER_MINUTE) },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // APP_GUARD registra el guard para TODA la aplicación, aunque se declare dentro de este módulo
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
