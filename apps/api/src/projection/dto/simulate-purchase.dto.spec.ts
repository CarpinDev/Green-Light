import { ValidationPipe } from '@nestjs/common';
import { SimulatePurchaseDto } from './simulate-purchase.dto';

// Las reglas de forma del cuerpo de POST /simulations, con el mismo ValidationPipe que usa main.ts.
// Las reglas de negocio (tarjeta que existe, fecha vs. saldo) viven en buildSimulation. Datos ficticios.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SimulatePurchaseDto });

const purchase = { cardId: 1, amountCents: 120_000_000, installments: 3 };

describe('SimulatePurchaseDto', () => {
  it('acepta lo mínimo y también fecha, promoción y meses', async () => {
    await expect(validate(purchase)).resolves.toBeDefined();
    await expect(validate({ ...purchase, date: '2026-03-12', promo: { mv: '0' }, months: 12 })).resolves.toBeDefined();
  });

  it('cardId, amountCents e installments son obligatorios', async () => {
    await expect(validate({ amountCents: 1, installments: 1 })).rejects.toThrow();
    await expect(validate({ cardId: 1, installments: 1 })).rejects.toThrow();
    await expect(validate({ cardId: 1, amountCents: 1 })).rejects.toThrow();
  });

  it('rechaza monto 0, centavos con decimales y cuotas fuera de 1 a 72', async () => {
    await expect(validate({ ...purchase, amountCents: 0 })).rejects.toThrow();
    await expect(validate({ ...purchase, amountCents: 10.5 })).rejects.toThrow();
    await expect(validate({ ...purchase, installments: 0 })).rejects.toThrow();
    await expect(validate({ ...purchase, installments: 73 })).rejects.toThrow();
    await expect(validate({ ...purchase, installments: 72 })).resolves.toBeDefined();
  });

  it('los meses van de 1 a 24', async () => {
    await expect(validate({ ...purchase, months: 0 })).rejects.toThrow();
    await expect(validate({ ...purchase, months: 25 })).rejects.toThrow();
    await expect(validate({ ...purchase, months: 24 })).resolves.toBeDefined();
  });

  it('rechaza una fecha imposible, una promoción mal escrita y campos de más', async () => {
    await expect(validate({ ...purchase, date: '2026-02-30' })).rejects.toThrow();
    await expect(validate({ ...purchase, promo: { ea: 'abc' } })).rejects.toThrow();
    await expect(validate({ ...purchase, color: 'azul' })).rejects.toThrow();
  });
});
