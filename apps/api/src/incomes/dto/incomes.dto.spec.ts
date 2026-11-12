import { ValidationPipe } from '@nestjs/common';
import { CreateCategoryDto } from '../../movements/dto/create-category.dto';
import { UpdateSettingsDto } from '../../settings/dto/update-settings.dto';
import {
  AmountChangeDto,
  CreateFixedExpenseDto,
  CreateOneOffIncomeDto,
  CreateRecurringIncomeDto,
  ListMonthlyQuery,
  UpdateFixedExpenseDto,
  UpdateRecurringIncomeDto,
} from './incomes.dto';

// La forma del cuerpo de los endpoints de planeación, con el mismo ValidationPipe que usa main.ts.
// El orden de las fechas y las referencias entre tablas las revisan los services.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

describe('CreateCategoryDto', () => {
  it('acepta nombre y tipo; rechaza un tipo desconocido o un nombre vacío', async () => {
    await expect(validate(CreateCategoryDto, { name: 'Mercado', kind: 'expense' })).resolves.toBeDefined();
    await expect(validate(CreateCategoryDto, { name: 'Mercado', kind: 'otro' })).rejects.toThrow();
    await expect(validate(CreateCategoryDto, { name: '', kind: 'expense' })).rejects.toThrow();
  });
});

describe('CreateRecurringIncomeDto y CreateFixedExpenseDto', () => {
  const base = { name: 'Salario', amountCents: 300_000_000, dayOfMonth: 30, startDate: '2026-01-01' };

  it('el día va de 1 a 31', async () => {
    for (const Dto of [CreateRecurringIncomeDto, CreateFixedExpenseDto]) {
      await expect(validate(Dto, { ...base, dayOfMonth: 0 })).rejects.toThrow();
      await expect(validate(Dto, { ...base, dayOfMonth: 32 })).rejects.toThrow();
      await expect(validate(Dto, { ...base, dayOfMonth: 31 })).resolves.toBeDefined();
    }
  });

  it('rechaza monto 0, fecha imposible y campos de más', async () => {
    await expect(validate(CreateRecurringIncomeDto, { ...base, amountCents: 0 })).rejects.toThrow();
    await expect(validate(CreateFixedExpenseDto, { ...base, startDate: '2026-02-30' })).rejects.toThrow();
    await expect(validate(CreateFixedExpenseDto, { ...base, color: 'azul' })).rejects.toThrow();
  });
});

describe('CreateOneOffIncomeDto', () => {
  it('acepta un ingreso puntual y rechaza monto 0', async () => {
    await expect(
      validate(CreateOneOffIncomeDto, { date: '2026-06-20', amountCents: 50_000_000 }),
    ).resolves.toBeDefined();
    await expect(validate(CreateOneOffIncomeDto, { date: '2026-06-20', amountCents: 0 })).rejects.toThrow();
  });
});

describe('UpdateRecurringIncomeDto y UpdateFixedExpenseDto', () => {
  it('acepta cualquier subconjunto de campos, incluso vacío, y null para quitar', async () => {
    for (const Dto of [UpdateRecurringIncomeDto, UpdateFixedExpenseDto]) {
      await expect(validate(Dto, {})).resolves.toBeDefined();
      await expect(validate(Dto, { name: 'Otro', dayOfMonth: 31, endDate: null })).resolves.toBeDefined();
    }
    await expect(validate(UpdateRecurringIncomeDto, { destinationAccountId: null })).resolves.toBeDefined();
    await expect(validate(UpdateFixedExpenseDto, { cardId: null, categoryId: 3 })).resolves.toBeDefined();
  });

  it('rechaza amountCents y startDate: el monto cambia con amount-changes', async () => {
    for (const Dto of [UpdateRecurringIncomeDto, UpdateFixedExpenseDto]) {
      await expect(validate(Dto, { amountCents: 100 })).rejects.toThrow();
      await expect(validate(Dto, { startDate: '2026-01-01' })).rejects.toThrow();
    }
  });

  it('rechaza día fuera de 1..31, fecha imposible y nombre vacío', async () => {
    for (const Dto of [UpdateRecurringIncomeDto, UpdateFixedExpenseDto]) {
      await expect(validate(Dto, { dayOfMonth: 32 })).rejects.toThrow();
      await expect(validate(Dto, { endDate: '2026-02-30' })).rejects.toThrow();
      await expect(validate(Dto, { name: '' })).rejects.toThrow();
    }
  });
});

describe('AmountChangeDto', () => {
  it('pide monto positivo y fecha real', async () => {
    await expect(validate(AmountChangeDto, { amountCents: 350, effectiveFrom: '2026-07-01' })).resolves.toBeDefined();
    await expect(validate(AmountChangeDto, { amountCents: 0, effectiveFrom: '2026-07-01' })).rejects.toThrow();
    await expect(validate(AmountChangeDto, { amountCents: 350, effectiveFrom: '2026-13-01' })).rejects.toThrow();
    await expect(validate(AmountChangeDto, { amountCents: 350 })).rejects.toThrow();
  });
});

describe('ListMonthlyQuery', () => {
  it('active es opcional y solo true o false', async () => {
    await expect(validate(ListMonthlyQuery, {})).resolves.toBeDefined();
    await expect(validate(ListMonthlyQuery, { active: 'true' })).resolves.toBeDefined();
    await expect(validate(ListMonthlyQuery, { active: 'si' })).rejects.toThrow();
  });
});

describe('UpdateSettingsDto', () => {
  it('acepta cualquiera de los 4 umbrales como texto', async () => {
    await expect(validate(UpdateSettingsDto, { debtToIncomePct: '0.25' })).resolves.toBeDefined();
    await expect(validate(UpdateSettingsDto, {})).resolves.toBeDefined();
  });

  it('rechaza un número (debe ser texto), texto que no es número y un campo desconocido', async () => {
    await expect(validate(UpdateSettingsDto, { debtToIncomePct: 0.25 })).rejects.toThrow();
    await expect(validate(UpdateSettingsDto, { debtToIncomePct: 'abc' })).rejects.toThrow();
    await expect(validate(UpdateSettingsDto, { id: 2 })).rejects.toThrow();
  });
});
