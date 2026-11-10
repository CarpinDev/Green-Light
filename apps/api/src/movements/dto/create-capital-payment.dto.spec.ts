import { ValidationPipe } from '@nestjs/common';
import { CreateCapitalPaymentDto } from './create-capital-payment.dto';

// La forma del cuerpo, con el mismo ValidationPipe que usa main.ts. Las reglas que cruzan
// tablas (la compra es de esa tarjeta y anterior al abono) las revisa el service.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateCapitalPaymentDto });

const payment = { productId: 1, date: '2026-03-25', amountCents: 20_000_000 };

describe('CreateCapitalPaymentDto', () => {
  it('acepta un abono mínimo y uno a una compra con su modo', async () => {
    await expect(validate(payment)).resolves.toBeDefined();
    await expect(validate({ ...payment, expenseId: 20, mode: 'reduce_payment' })).resolves.toBeDefined();
  });

  it('rechaza monto 0, centavos con decimales, fecha imposible, modo desconocido y campos de más', async () => {
    await expect(validate({ ...payment, amountCents: 0 })).rejects.toThrow();
    await expect(validate({ ...payment, amountCents: 10.5 })).rejects.toThrow();
    await expect(validate({ ...payment, date: '2026-02-30' })).rejects.toThrow();
    await expect(validate({ ...payment, mode: 'otro' })).rejects.toThrow();
    await expect(validate({ ...payment, color: 'azul' })).rejects.toThrow();
  });
});
