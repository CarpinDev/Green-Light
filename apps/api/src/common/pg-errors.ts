import { QueryFailedError } from 'typeorm';

/** Código de Postgres para una violación de unicidad. */
const UNIQUE_VIOLATION = '23505';

/** `true` si el error es Postgres diciendo que se violó una restricción única. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string }).code === UNIQUE_VIOLATION
  );
}
