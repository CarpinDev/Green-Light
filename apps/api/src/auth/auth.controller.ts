import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { PublicUser } from '../users/users.service';
import { type Session, AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Abierta (@Public) y con límite de intentos. ThrottlerGuard se aplica con @UseGuards solo en estas dos rutas:
   * no está registrado como guard global, así que el resto de la API no cuenta peticiones.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<Session> {
    return this.auth.register(dto);
  }

  /** 200 y no 201: iniciar sesión no crea nada. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<Session> {
    return this.auth.login(dto);
  }

  /** Quién eres según tu token. Sin @Public(): el guard global ya exigió el token. */
  @Get('me')
  me(@CurrentUser() userId: number): Promise<PublicUser> {
    return this.auth.me(userId);
  }
}
