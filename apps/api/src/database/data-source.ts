import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { typeOrmConfig, useSsl } from './typeorm.config';

/**
 * Fuente de datos del CLI de TypeORM (migraciones). Lee la conexión de apps/api/.env.
 *
 * Si existe DATABASE_URL_DIRECT se usa esa URL y no las DB_*: es la conexión directa de Neon (host sin `-pooler`).
 * El pooler de Neon (PgBouncer en modo transacción) puede romper las migraciones, así que se migra por la directa
 * aunque la API use el pooler. Solo la lee el CLI; la API sigue con las DB_*.
 */
const directUrl = process.env.DATABASE_URL_DIRECT;
const base = typeOrmConfig();

export default new DataSource(
  directUrl
    ? ({ ...base, url: directUrl, ssl: useSsl(new URL(directUrl).hostname, process.env.DB_SSL) } as DataSourceOptions)
    : base,
);
