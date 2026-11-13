import { type INestApplication, ValidationPipe } from '@nestjs/common';

/** El origen de la app web de Expo (puerto 8081): es otro origen que la API, y sin CORS el navegador bloquea sus llamadas. */
export const WEB_ORIGIN = 'http://localhost:8081';

/**
 * Lo que se configura sobre la app de Nest además de sus módulos. Vive aparte de main.ts para que las pruebas
 * e2e arranquen la app exactamente igual que producción.
 */
export function configureApp(app: INestApplication): void {
  // Un campo que no está en el DTO responde 400 en vez de pasar en silencio
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  // Authorization va explícito: sin él el navegador bloquea el token en la web. El origen sigue siendo solo uno.
  app.enableCors({
    origin: WEB_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
