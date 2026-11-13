import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 10;
/** Tope de la contraseña: argon2 es lento a propósito, y una de 1 MB sería una forma barata de saturar el servidor. */
export const MAX_PASSWORD_LENGTH = 128;

const lowerTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // En el login no se exige el mínimo de 10: solo hay que compararla (y no revelar la regla a quien adivina)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class RegisterDto {
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  inviteCode!: string;
}
