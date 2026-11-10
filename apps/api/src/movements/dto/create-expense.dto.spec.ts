import { ValidationPipe } from '@nestjs/common';
import { CreateExpenseDto } from './create-expense.dto';

// Las reglas de forma del cuerpo, con el mismo ValidationPipe que usa main.ts. Las reglas que
// dependen del tipo de producto viven en ExpensesService. Datos ficticios.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateExpenseDto });

const expense = { date: '2026-03-12', amountCents: 20_000_000, sourceProductId: 1 };

describe('CreateExpenseDto', () => {
  it('acepta un gasto mínimo y uno con tarjeta, cuotas y promoción', async () => {
    await expect(validate(expense)).resolves.toBeDefined();
    await expect(
      validate({
        ...expense,
        categoryId: 10,
        description: 'Televisor',
        installments: 12,
        promo: { ea: '0', description: '12 cuotas sin interés' },
        isOpeningDebt: false,
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza monto 0, centavos con decimales, fecha imposible y campos de más', async () => {
    await expect(validate({ ...expense, amountCents: 0 })).rejects.toThrow();
    await expect(validate({ ...expense, amountCents: 10.5 })).rejects.toThrow();
    await expect(validate({ ...expense, date: '2026-02-30' })).rejects.toThrow();
    await expect(validate({ ...expense, color: 'azul' })).rejects.toThrow();
  });

  it('las cuotas van de 1 a 72', async () => {
    await expect(validate({ ...expense, installments: 0 })).rejects.toThrow();
    await expect(validate({ ...expense, installments: 73 })).rejects.toThrow();
    await expect(validate({ ...expense, installments: 72 })).resolves.toBeDefined();
  });

  it('valida el contenido de la promoción', async () => {
    await expect(validate({ ...expense, promo: { ea: 'abc' } })).rejects.toThrow();
    await expect(validate({ ...expense, promo: { ea: '0', extra: 1 } })).rejects.toThrow();
  });
});
