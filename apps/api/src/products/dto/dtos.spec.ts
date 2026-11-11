import { ValidationPipe } from '@nestjs/common';
import { ConfirmBalanceDto } from './confirm-balance.dto';
import { CreateAccountDto } from './create-account.dto';
import { CreateLoanDto } from './create-loan.dto';

// Las reglas de forma del cuerpo, con el mismo ValidationPipe que usa main.ts. Datos ficticios.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

const loan = {
  name: 'Libre inversión',
  bank: 'Banco Ejemplo',
  last4: '9876',
  principalCents: 1_000_000_000,
  termMonths: 12,
  firstPaymentDate: '2026-02-10',
  rate: { effectiveFrom: '2026-01-01', ea: '0.195618' },
};

describe('CreateLoanDto', () => {
  it('acepta un préstamo válido', async () => {
    await expect(validate(CreateLoanDto, loan)).resolves.toBeDefined();
  });

  it('la cuota del banco, si viene, debe ser mayor que 0', async () => {
    await expect(validate(CreateLoanDto, { ...loan, fixedPaymentCents: 0 })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, fixedPaymentCents: -5 })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, fixedPaymentCents: 91_679_993 })).resolves.toBeDefined();
  });

  it('rechaza plazo 0, centavos con decimales, fecha imposible y campos de más', async () => {
    await expect(validate(CreateLoanDto, { ...loan, termMonths: 0 })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, principalCents: 10.5 })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, firstPaymentDate: '2026-02-30' })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, color: 'azul' })).rejects.toThrow();
  });
});

describe('CreateAccountDto', () => {
  const account = { name: 'Ahorros', bank: 'Banco Ejemplo', last4: '1357', accountType: 'savings' };

  it('acepta una cuenta sin saldo inicial', async () => {
    await expect(validate(CreateAccountDto, account)).resolves.toBeDefined();
  });

  it('el saldo inicial puede ser negativo (sobregiro)', async () => {
    await expect(
      validate(CreateAccountDto, { ...account, openingBalanceCents: -5_000_000, asOf: '2026-03-10' }),
    ).resolves.toBeDefined();
  });

  it('rechaza un tipo de cuenta desconocido y un saldo con decimales', async () => {
    await expect(validate(CreateAccountDto, { ...account, accountType: 'crypto' })).rejects.toThrow();
    await expect(
      validate(CreateAccountDto, { ...account, openingBalanceCents: 1.5, asOf: '2026-03-10' }),
    ).rejects.toThrow();
  });
});

describe('ConfirmBalanceDto', () => {
  it('acepta un saldo negativo y rechaza uno sin fecha o con fecha imposible', async () => {
    await expect(validate(ConfirmBalanceDto, { asOf: '2026-04-01', balanceCents: -1_000 })).resolves.toBeDefined();
    await expect(validate(ConfirmBalanceDto, { balanceCents: 1_000 })).rejects.toThrow();
    await expect(validate(ConfirmBalanceDto, { asOf: '2026-13-01', balanceCents: 1_000 })).rejects.toThrow();
  });
});
