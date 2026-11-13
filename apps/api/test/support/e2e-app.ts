import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../../src/database/typeorm.config';
import { assertSafeTarget, envFor, freshDatabase } from './test-db';

export const INVITE_CODE = 'invitacion-e2e';
export const JWT_SECRET = 'e2e-secreto-de-prueba-de-mas-de-32-caracteres';

export interface E2eApp {
  app: INestApplication;
  /** Cierra la app. */
  close: () => Promise<void>;
}

/**
 * Arranca la aplicación COMPLETA (AppModule, guard global, pipes y CORS reales) contra una base nueva y con todas
 * las migraciones aplicadas. `suffix` da el nombre de la base (gl_e2e_<suffix>): una por archivo de prueba, para que
 * Jest pueda correr varios archivos a la vez sin pisarse.
 */
export async function createE2eApp(suffix: string): Promise<E2eApp> {
  const settings = await freshDatabase(suffix);

  // process.env manda sobre apps/api/.env: así la app no puede terminar conectada a la base real por un descuido
  Object.assign(process.env, envFor(settings), {
    JWT_SECRET,
    JWT_EXPIRES_IN: '1h',
    INVITE_CODE,
    // Las pruebas registran y entran muchas veces; el límite real se prueba aparte (auth.controller.spec.ts)
    AUTH_RATE_LIMIT: '100000',
  });
  assertSafeTarget(process.env.DB_HOST ?? '', process.env.DB_NAME ?? '');

  // El esquema con las migraciones de verdad, no con synchronize
  const migrator = new DataSource(typeOrmConfig());
  await migrator.initialize();
  await migrator.runMigrations();
  await migrator.destroy();

  // Importar AppModule DESPUÉS de fijar el entorno: ConfigModule lee y valida las variables al cargarse
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { AppModule } = require('../../src/app.module') as typeof import('../../src/app.module');
  const { configureApp } = require('../../src/app.setup') as typeof import('../../src/app.setup');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, close: () => app.close() };
}
