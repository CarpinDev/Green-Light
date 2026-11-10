import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

/** Cómo leer una variable de entorno: process.env en el CLI, ConfigService en Nest. */
export type EnvReader = (key: string) => string | undefined;

/** Conexión a Postgres. La comparten el CLI (data-source.ts) y el módulo de Nest (AppModule). */
export function typeOrmConfig(env: EnvReader = (key) => process.env[key]): DataSourceOptions {
  return {
    type: 'postgres',
    host: env('DB_HOST') ?? 'localhost',
    port: Number(env('DB_PORT') ?? 5432),
    username: env('DB_USER'),
    password: env('DB_PASSWORD'),
    database: env('DB_NAME'),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // El esquema solo cambia con migraciones
    synchronize: false,
  };
}
