import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Detrás de un proxy (Render) req.ip sería la IP del proxy y todas las personas compartirían el límite de intentos
  // del login. TRUST_PROXY=1 le dice a Express que confíe en 1 salto y lea la IP real de X-Forwarded-For. Solo se
  // activa si se pide: sin proxy, cualquiera podría falsear esa cabecera para esquivar el límite.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
