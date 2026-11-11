import { ValidationPipe } from '@nestjs/common';
import { CheckStatementDto } from './check-statement.dto';

// Las reglas de forma del cuerpo de POST /statement-checks, con el mismo ValidationPipe que usa main.ts.
// Las reglas de negocio (fecha de corte, total contra mínimo) viven en buildStatementCheck. Datos ficticios.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CheckStatementDto });

const statement = { cardId: 1, cutDate: '2026-03-15', statementMinimumCents: 48_000_000 };

describe('CheckStatementDto', () => {
  it('acepta lo mínimo y también el pago total', async () => {
    await expect(validate(statement)).resolves.toBeDefined();
    await expect(validate({ ...statement, statementTotalCents: 90_000_000 })).resolves.toBeDefined();
  });

  it('cardId, cutDate y statementMinimumCents son obligatorios', async () => {
    await expect(validate({ cutDate: '2026-03-15', statementMinimumCents: 1 })).rejects.toThrow();
    await expect(validate({ cardId: 1, statementMinimumCents: 1 })).rejects.toThrow();
    await expect(validate({ cardId: 1, cutDate: '2026-03-15' })).rejects.toThrow();
  });

  it('el mínimo puede ser 0 (extracto sin deuda), pero no negativo ni con decimales', async () => {
    await expect(validate({ ...statement, statementMinimumCents: 0 })).resolves.toBeDefined();
    await expect(validate({ ...statement, statementMinimumCents: -1 })).rejects.toThrow();
    await expect(validate({ ...statement, statementMinimumCents: 10.5 })).rejects.toThrow();
  });

  it('rechaza un total negativo, una fecha imposible y campos de más', async () => {
    await expect(validate({ ...statement, statementTotalCents: -5 })).rejects.toThrow();
    await expect(validate({ ...statement, cutDate: '2026-02-30' })).rejects.toThrow();
    await expect(validate({ ...statement, color: 'azul' })).rejects.toThrow();
  });
});
