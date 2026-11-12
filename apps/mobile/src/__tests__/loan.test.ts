import { describe, expect, it } from '@jest/globals';

import type { LoanEffect, LoanSummary, LoanTerms } from '@/api/types';
import {
  type LoanFormValues,
  loanBody,
  loanRowText,
  loanUpdateBody,
  parseInsurancePct,
  parseTerm,
  prepaymentEffectText,
} from '@/products/loan';

const loan = (overrides: Partial<LoanSummary> = {}): LoanSummary => ({
  id: 1,
  name: 'RappiPréstamo',
  bank: 'Rappi',
  last4: '1111',
  rate: { ea: '0.2666', mv: '0.0196148' },
  installmentCents: 24_800_000,
  insuranceCents: 700_000,
  balanceCents: 286_466_700,
  nextDueDate: '2026-11-30',
  remainingInstallments: 13,
  endDate: '2027-11-30',
  ...overrides,
});

describe('loanRowText', () => {
  it('la cuota con su fecha y cuántas quedan', () => {
    const { installment, remaining } = loanRowText(loan());
    expect(installment).toMatch(/^Cuota .*248\.000.* el 30 nov$/);
    expect(remaining).toMatch(/^Quedan 13 cuotas · hasta noviembre.*2027$/);
  });

  it('singular y pagado', () => {
    expect(loanRowText(loan({ remainingInstallments: 1 })).remaining).toMatch(/^Queda 1 cuota/);
    const paid = loanRowText(loan({ remainingInstallments: 0, nextDueDate: null, endDate: null }));
    expect(paid).toEqual({ installment: 'Sin cuotas pendientes', remaining: 'Ya está pagado' });
  });
});

describe('parseInsurancePct y parseTerm', () => {
  it('el porcentaje acepta coma o punto, hasta 4 decimales, mayor que 0', () => {
    expect(parseInsurancePct('0,2344')).toBe('0.2344');
    expect(parseInsurancePct(' 0.2344 ')).toBe('0.2344');
    expect(parseInsurancePct('1')).toBe('1');
    for (const bad of ['', '0', '0,00', '0,23441', '100', 'abc', '-1']) expect(parseInsurancePct(bad)).toBeNull();
  });

  it('las cuotas: de 1 a 600', () => {
    expect(parseTerm('13')).toBe(13);
    expect(parseTerm('600')).toBe(600);
    for (const bad of ['', '0', '601', '1.5', 'x']) expect(parseTerm(bad)).toBeNull();
  });
});

const form = (overrides: Partial<LoanFormValues> = {}): LoanFormValues => ({
  name: 'Libre inversión Nu',
  bank: 'Nu',
  last4: '2222',
  principalCents: 35_123_672,
  percent: '61,35',
  rateKind: 'ea',
  installments: '20',
  nextDate: '2026-11-15',
  installmentCents: null,
  insuranceMode: 'fixed',
  insuranceCents: null,
  insurancePct: '',
  today: '2026-11-01',
  ...overrides,
});

describe('loanBody', () => {
  it('lo mínimo: sin cuota ni seguro no se mandan', () => {
    const { body } = loanBody(form());
    expect(body).toEqual({
      name: 'Libre inversión Nu',
      bank: 'Nu',
      last4: '2222',
      principalCents: 35_123_672,
      termMonths: 20,
      firstPaymentDate: '2026-11-15',
      rate: { effectiveFrom: '2026-11-01', ea: '0.6135' },
    });
    expect(body).not.toHaveProperty('installmentTotalCents');
    expect(body).not.toHaveProperty('fixedPaymentCents');
    expect(body).not.toHaveProperty('insuranceCents');
  });

  it('una cuota vacía o en 0 no se manda', () => {
    expect(loanBody(form({ installmentCents: 0 })).body).not.toHaveProperty('installmentTotalCents');
  });

  it('con seguro fijo, lo que ve el usuario va como cuota total y el seguro aparte', () => {
    const { body } = loanBody(form({ installmentCents: 3_000_000, insuranceCents: 343_262 }));
    expect(body).toMatchObject({ installmentTotalCents: 3_000_000, insuranceCents: 343_262 });
    expect(body).not.toHaveProperty('fixedPaymentCents');
  });

  it('con seguro por porcentaje, la cuota va sin seguro (fixedPaymentCents) y el porcentaje como texto', () => {
    const { body } = loanBody(
      form({
        insuranceMode: 'percent',
        insurancePct: '0,2344',
        installmentCents: 24_151_046,
        percent: '1,96148',
        rateKind: 'mv',
      }),
    );
    expect(body).toMatchObject({
      fixedPaymentCents: 24_151_046,
      insuranceRatePct: '0.2344',
      rate: { mv: '0.0196148' },
    });
    expect(body).not.toHaveProperty('installmentTotalCents');
    expect(body).not.toHaveProperty('insuranceCents');
  });

  it('seguro por porcentaje vacío no se manda; uno inválido es un error', () => {
    expect(loanBody(form({ insuranceMode: 'percent' })).body).not.toHaveProperty('insuranceRatePct');
    expect(loanBody(form({ insuranceMode: 'percent', insurancePct: '2,3,4' })).error).toMatch(/porcentaje mensual/);
  });

  it('nunca manda los dos seguros', () => {
    const fixed = loanBody(form({ insuranceCents: 100, insurancePct: '0,2' })).body as object;
    expect('insuranceRatePct' in fixed).toBe(false);
    const percent = loanBody(form({ insuranceMode: 'percent', insuranceCents: 100, insurancePct: '0,2' }))
      .body as object;
    expect('insuranceCents' in percent).toBe(false);
  });

  it('errores de forma', () => {
    expect(loanBody(form({ name: ' ' })).error).toMatch(/nombre/);
    expect(loanBody(form({ bank: '' })).error).toMatch(/banco/);
    expect(loanBody(form({ last4: '12' })).error).toMatch(/4 dígitos/);
    expect(loanBody(form({ principalCents: null })).error).toMatch(/capital/);
    expect(loanBody(form({ percent: 'x' })).error).toMatch(/tasa/);
    expect(loanBody(form({ installments: '0' })).error).toMatch(/cuotas/);
    expect(loanBody(form({ nextDate: '2026-02-30' })).error).toMatch(/fecha/);
  });
});

describe('loanUpdateBody', () => {
  const terms = (overrides: Partial<LoanTerms> = {}): LoanTerms => ({
    principalCents: 1,
    termMonths: 13,
    firstPaymentDate: '2026-11-30',
    fixedPaymentCents: 24_151_046,
    insuranceCents: 0,
    insuranceRatePct: '0.2344',
    ...overrides,
  });
  const current = (t: LoanTerms = terms()) => ({ name: 'RappiPréstamo', terms: t });
  const values = (overrides = {}) => ({
    name: 'RappiPréstamo',
    fixedPaymentCents: 24_151_046 as number | null,
    insuranceMode: 'percent' as const,
    insuranceCents: null as number | null,
    insurancePct: '0,2344',
    ...overrides,
  });

  it('sin cambios, cuerpo vacío', () => {
    expect(loanUpdateBody(current(), values()).body).toEqual({});
  });

  it('solo manda lo que cambió', () => {
    expect(loanUpdateBody(current(), values({ name: 'Rappi libre', fixedPaymentCents: 25_000_000 })).body).toEqual({
      name: 'Rappi libre',
      fixedPaymentCents: 25_000_000,
    });
  });

  it('cuota vacía = que la calcule el motor (null)', () => {
    expect(loanUpdateBody(current(), values({ fixedPaymentCents: null })).body).toEqual({ fixedPaymentCents: null });
    expect(
      loanUpdateBody(current(terms({ fixedPaymentCents: null })), values({ fixedPaymentCents: null })).body,
    ).toEqual({});
  });

  it('cambiar el porcentaje, quitarlo, o pasar a seguro fijo', () => {
    expect(loanUpdateBody(current(), values({ insurancePct: '0,25' })).body).toEqual({ insuranceRatePct: '0.25' });
    expect(loanUpdateBody(current(), values({ insurancePct: '' })).body).toEqual({ insuranceRatePct: null });
    expect(loanUpdateBody(current(), values({ insuranceMode: 'fixed', insuranceCents: 700_000 })).body).toEqual({
      insuranceCents: 700_000,
    });
    // De porcentaje a "sin seguro fijo": manda 0 para limpiar el porcentaje
    expect(loanUpdateBody(current(), values({ insuranceMode: 'fixed', insuranceCents: null })).body).toEqual({
      insuranceCents: 0,
    });
  });

  it('un porcentaje inválido es un error', () => {
    expect(loanUpdateBody(current(), values({ insurancePct: 'x' })).error).toMatch(/porcentaje/);
  });
});

describe('prepaymentEffectText', () => {
  const effect = (overrides: Partial<LoanEffect> = {}): LoanEffect => ({
    installmentCents: 2_656_738,
    remainingInstallments: 20,
    endDate: '2028-06-15',
    balanceCents: 35_123_672,
    ...overrides,
  });

  it('reducir plazo: dice cuándo terminas ahora y cuándo terminabas', () => {
    const text = prepaymentEffectText(
      'reduce_term',
      effect(),
      effect({ remainingInstallments: 17, endDate: '2028-03-15' }),
    );
    expect(text).toMatch(/^Terminas en marzo.*2028 en vez de junio.*2028 \(3 cuotas menos\)\.$/);
  });

  it('reducir plazo sin cambiar de mes, o sin efecto', () => {
    expect(
      prepaymentEffectText('reduce_term', effect(), effect({ remainingInstallments: 19, endDate: '2028-06-20' })),
    ).toBe('Terminas 1 cuota antes.');
    expect(prepaymentEffectText('reduce_term', effect(), effect())).toBe('Este abono no cambia cuándo terminas.');
  });

  it('reducir cuota: la cuota nueva', () => {
    const text = prepaymentEffectText('reduce_payment', effect(), effect({ installmentCents: 2_400_000 }));
    expect(text).toMatch(/^Tu cuota baja a .*24\.000.* \(antes .*26\.567.*\)\.$/);
    expect(prepaymentEffectText('reduce_payment', effect(), effect())).toBe('Este abono no cambia tu cuota.');
  });

  it('si termina de pagar el préstamo, lo dice', () => {
    const done = effect({ remainingInstallments: 0, endDate: null, installmentCents: 0, balanceCents: 0 });
    expect(prepaymentEffectText('reduce_term', effect(), done)).toBe('Con este abono terminas de pagar el préstamo.');
    expect(prepaymentEffectText('reduce_payment', effect(), done)).toBe(
      'Con este abono terminas de pagar el préstamo.',
    );
  });
});
