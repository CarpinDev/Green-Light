/** Lo mínimo de seguridad para que la API arranque. Si falta algo, mejor no arrancar que arrancar abierta. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** 30d, 12h, 90m, 45s, 2w o un número de segundos: el formato de expiresIn de @nestjs/jwt. */
const DURATION = /^\d+\s*(s|m|h|d|w|y)?$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Se pasa a ConfigModule.forRoot({ validate }): Nest la llama al arrancar con todas las variables (las de .env y
 * las del sistema). Si lanza, la aplicación no inicia y el mensaje dice qué falta.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const secret = text(config.JWT_SECRET);
  if (secret === '') errors.push('JWT_SECRET no está definida');
  else if (secret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET es muy corta (${secret.length}): necesita al menos ${MIN_JWT_SECRET_LENGTH} caracteres`);
  }

  if (text(config.INVITE_CODE) === '') errors.push('INVITE_CODE no está definida');

  const expires = text(config.JWT_EXPIRES_IN) || '30d';
  if (!DURATION.test(expires)) errors.push(`JWT_EXPIRES_IN "${expires}" no es una duración válida (ej. 30d, 12h)`);

  if (errors.length > 0) {
    throw new Error(
      `Configuración inválida:\n- ${errors.join('\n- ')}\nRevisa apps/api/.env (ejemplo en .env.example).`,
    );
  }
  return { ...config, JWT_EXPIRES_IN: expires };
}
