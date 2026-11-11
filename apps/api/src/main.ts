import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Un campo que no está en el DTO responde 400 en vez de pasar en silencio
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  // La app web de Expo (puerto 8081) es otro origen: sin esto el navegador bloquea sus llamadas
  app.enableCors({ origin: 'http://localhost:8081' });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
