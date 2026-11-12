import { ValidationPipe } from '@nestjs/common';
import { ConfirmBalanceDto } from './confirm-balance.dto';
import { CreateAccountDto } from './create-account.dto';
import { CreateLoanDto } from './create-loan.dto';
import { OpeningDebtDto } from './opening-debt.dto';
import { RateDto } from './rate.dto';
import { UpdateCardDto } from './update-card.dto';
import { UpdateLoanDto } from './update-loan.dto';

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

  it('acepta la cuota total del extracto y el seguro por porcentaje como texto', async () => {
    await expect(validate(CreateLoanDto, { ...loan, installmentTotalCents: 2_656_738 })).resolves.toBeDefined();
    await expect(validate(CreateLoanDto, { ...loan, insuranceRatePct: '0.2344' })).resolves.toBeDefined();
    await expect(validate(CreateLoanDto, { ...loan, installmentTotalCents: 0 })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, insuranceRatePct: '0,2344' })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, insuranceRatePct: '0.23441' })).rejects.toThrow();
    await expect(validate(CreateLoanDto, { ...loan, insuranceRatePct: 0.2344 })).rejects.toThrow();
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

describe('UpdateCardDto', () => {
  it('acepta cualquier subconjunto de campos, incluso vacío', async () => {
    await expect(validate(UpdateCardDto, {})).resolves.toBeDefined();
    await expect(validate(UpdateCardDto, { name: 'Visa Oro', cutDay: 20 })).resolves.toBeDefined();
    await expect(
      validate(UpdateCardDto, { minPaymentMethod: 'fixed_installment', firstPeriodInterest: 'none' }),
    ).resolves.toBeDefined();
  });

  it('rechaza bank y last4: son la identidad de la tarjeta', async () => {
    await expect(validate(UpdateCardDto, { last4: '9999' })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { bank: 'Otro' })).rejects.toThrow();
  });

  it('rechaza día fuera de 1..31, cupo 0, nombre vacío y valores de enum inventados', async () => {
    await expect(validate(UpdateCardDto, { cutDay: 0 })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { dueDay: 32 })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { creditLimitCents: 0 })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { name: '' })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { minPaymentMethod: 'otro' })).rejects.toThrow();
    await expect(validate(UpdateCardDto, { firstPeriodInterest: 'otro' })).rejects.toThrow();
  });

  it('los cargos pueden ser 0 pero no negativos', async () => {
    await expect(validate(UpdateCardDto, { handlingFeeCents: 0, insuranceCents: 0 })).resolves.toBeDefined();
    await expect(validate(UpdateCardDto, { handlingFeeCents: -1 })).rejects.toThrow();
  });
});

describe('RateDto (POST /products/:id/rates)', () => {
  it('pide la fecha y acepta la E.A., la M.V. o las dos como texto', async () => {
    await expect(validate(RateDto, { effectiveFrom: '2026-07-01', ea: '0.2899' })).resolves.toBeDefined();
    await expect(validate(RateDto, { effectiveFrom: '2026-07-01', mv: '0.0214' })).resolves.toBeDefined();
    await expect(validate(RateDto, { ea: '0.2899' })).rejects.toThrow();
  });

  it('rechaza una tasa que llega como number, una fecha imposible y campos de más', async () => {
    await expect(validate(RateDto, { effectiveFrom: '2026-07-01', ea: 0.2899 })).rejects.toThrow();
    await expect(validate(RateDto, { effectiveFrom: '2026-02-30', ea: '0.2899' })).rejects.toThrow();
    await expect(validate(RateDto, { effectiveFrom: '2026-07-01', ea: '0.2', source: 'ea' })).rejects.toThrow();
  });
});

describe('OpeningDebtDto', () => {
  const item = { amountCents: 190_000_000, installments: 2 };

  it('acepta de 1 a 30 grupos, con o sin promoción', async () => {
    await expect(validate(OpeningDebtDto, { items: [item] })).resolves.toBeDefined();
    await expect(
      validate(OpeningDebtDto, {
        items: [item, { ...item, installments: 12, promo: { ea: '0', description: 'Promo' } }],
      }),
    ).resolves.toBeDefined();
    await expect(validate(OpeningDebtDto, { items: Array.from({ length: 30 }, () => item) })).resolves.toBeDefined();
  });

  it('statementPaid es opcional y debe ser booleano', async () => {
    await expect(validate(OpeningDebtDto, { items: [item], statementPaid: true })).resolves.toBeDefined();
    await expect(validate(OpeningDebtDto, { items: [item], statementPaid: 'si' })).rejects.toThrow();
  });

  it('rechaza 0 grupos, 31 grupos y que items no sea una lista', async () => {
    await expect(validate(OpeningDebtDto, { items: [] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: Array.from({ length: 31 }, () => item) })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, {})).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: item })).rejects.toThrow();
  });

  it('valida cada grupo: monto mayor que 0 y cuotas de 1 a 72', async () => {
    await expect(validate(OpeningDebtDto, { items: [{ ...item, amountCents: 0 }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, amountCents: 10.5 }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, installments: 0 }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, installments: 73 }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, installments: 72 }] })).resolves.toBeDefined();
    // Un grupo malo entre varios buenos también se rechaza
    await expect(validate(OpeningDebtDto, { items: [item, { ...item, installments: 0 }] })).rejects.toThrow();
  });

  it('la promoción va como texto; un number o un campo de más se rechazan', async () => {
    await expect(validate(OpeningDebtDto, { items: [{ ...item, promo: { ea: 0 } }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, promo: { ea: 'abc' } }] })).rejects.toThrow();
    await expect(validate(OpeningDebtDto, { items: [{ ...item, color: 'azul' }] })).rejects.toThrow();
  });
});

describe('UpdateLoanDto', () => {
  it('acepta nombre, banco, últimos 4, cuota (o null) y seguro', async () => {
    await expect(validate(UpdateLoanDto, { name: 'Nu libre', bank: 'Nu', last4: '1234' })).resolves.toBeDefined();
    await expect(validate(UpdateLoanDto, { fixedPaymentCents: 2_656_738 })).resolves.toBeDefined();
    await expect(validate(UpdateLoanDto, { fixedPaymentCents: null })).resolves.toBeDefined();
    await expect(validate(UpdateLoanDto, { insuranceCents: 0 })).resolves.toBeDefined();
    await expect(validate(UpdateLoanDto, { insuranceRatePct: '0.2344' })).resolves.toBeDefined();
    await expect(validate(UpdateLoanDto, { insuranceRatePct: null })).resolves.toBeDefined();
  });

  it('no acepta el capital, las cuotas ni la primera fecha: reescriben la historia de los abonos', async () => {
    await expect(validate(UpdateLoanDto, { principalCents: 100 })).rejects.toThrow();
    await expect(validate(UpdateLoanDto, { termMonths: 10 })).rejects.toThrow();
    await expect(validate(UpdateLoanDto, { firstPaymentDate: '2026-12-01' })).rejects.toThrow();
  });

  it('valida la forma de lo que sí acepta', async () => {
    await expect(validate(UpdateLoanDto, { last4: '12' })).rejects.toThrow();
    await expect(validate(UpdateLoanDto, { name: '' })).rejects.toThrow();
    await expect(validate(UpdateLoanDto, { fixedPaymentCents: 0 })).rejects.toThrow();
  });
});
