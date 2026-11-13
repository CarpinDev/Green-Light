import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

/** Cómo leer una variable de entorno: process.env en el CLI, ConfigService en Nest. */
export type EnvReader = (key: string) => string | undefined;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * ¿La conexión usa SSL? Neon y cualquier base remota lo exigen; el Postgres de Docker local no lo habla.
 * DB_SSL=true|false manda; sin ella, SSL salvo que el host sea esta misma máquina.
 */
export function useSsl(host: string, flag: string | undefined): boolean {
  if (flag !== undefined && flag !== '') return flag.toLowerCase() === 'true';
  return !LOCAL_HOSTS.includes(host);
}

/** Conexión a Postgres. La comparten el CLI (data-source.ts) y el módulo de Nest (AppModule). */
export function typeOrmConfig(env: EnvReader = (key) => process.env[key]): DataSourceOptions {
  const host = env('DB_HOST') ?? 'localhost';
  return {
    type: 'postgres',
    host,
    port: Number(env('DB_PORT') ?? 5432),
    username: env('DB_USER'),
    password: env('DB_PASSWORD'),
    database: env('DB_NAME'),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // createdAt en TS queda created_at en la base, sin repetir name: en cada columna
    namingStrategy: new SnakeNamingStrategy(),
    // El esquema solo cambia con migraciones
    synchronize: false,
    ssl: useSsl(host, env('DB_SSL')),
  };
}
