import 'dotenv/config';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from './typeorm.config';

// Fuente de datos del CLI de TypeORM (migraciones). Lee la conexión de apps/api/.env
export default new DataSource(typeOrmConfig());
