import { Client } from 'pg';

// Bases de datos desechables para las pruebas e2e y de migración.
//
// SEGURIDAD: estas pruebas BORRAN y vuelven a crear su base. Por eso solo se permiten dos cosas, y se comprueban
// aquí antes de abrir ninguna conexión: que el servidor sea esta misma máquina, y que la base se llame gl_e2e_*.
// Nunca leen DB_HOST / DB_NAME de apps/api/.env (que puede apuntar a Neon): usan TEST_DB_* o los valores de
// docker-compose.yml.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const SAFE_DATABASE_NAME = /^gl_e2e_[a-z0-9_]{1,40}$/;

export interface TestDbSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** El servidor de pruebas: TEST_DB_* o el Postgres de docker-compose.yml. */
function serverSettings(): Omit<TestDbSettings, 'database'> {
  return {
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USER ?? 'greenlight',
    password: process.env.TEST_DB_PASSWORD ?? 'greenlight',
  };
}

export function assertSafeTarget(host: string, database: string): void {
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Las pruebas e2e solo corren contra una base en esta máquina (localhost), no contra "${host}". ` +
        'Levanta el Postgres local con "docker compose up -d".',
    );
  }
  if (!SAFE_DATABASE_NAME.test(database)) {
    throw new Error(`La base de pruebas debe llamarse gl_e2e_<algo>, no "${database}": estas pruebas la borran.`);
  }
}

/** Borra y vuelve a crear la base `gl_e2e_<suffix>`, y devuelve cómo conectarse a ella. */
export async function freshDatabase(suffix: string): Promise<TestDbSettings> {
  const server = serverSettings();
  const database = `gl_e2e_${suffix}`;
  assertSafeTarget(server.host, database);

  // Se conecta a la base de mantenimiento "postgres" para poder borrar y crear la otra
  const admin = new Client({ ...server, database: 'postgres', ssl: false });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `No pude conectarme a Postgres en ${server.host}:${server.port} (${(err as Error).message}). ` +
        'Las pruebas e2e necesitan el Postgres local: "docker compose up -d".',
    );
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  return { ...server, database };
}

/** Una conexión suelta a la base de pruebas, para sembrar filas o comprobar el resultado con SQL. */
export async function connect(settings: TestDbSettings): Promise<Client> {
  assertSafeTarget(settings.host, settings.database);
  const client = new Client({ ...settings, ssl: false });
  await client.connect();
  return client;
}

/** Las variables de entorno que hacen que la API (typeOrmConfig) apunte a esta base y no a la de apps/api/.env. */
export function envFor(settings: TestDbSettings): Record<string, string> {
  return {
    DB_HOST: settings.host,
    DB_PORT: String(settings.port),
    DB_USER: settings.user,
    DB_PASSWORD: settings.password,
    DB_NAME: settings.database,
    DB_SSL: 'false',
  };
}
