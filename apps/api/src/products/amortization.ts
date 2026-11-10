import type { AmortizationMethod, FirstPeriodInterest } from '@greenlight/engine';

// Los valores salen de los tipos del motor: si el motor agrega uno, TS avisa aquí
export const AMORTIZATION_METHODS = [
  'constant_capital',
  'fixed_installment',
] as const satisfies readonly AmortizationMethod[];

export const FIRST_PERIOD_INTERESTS = [
  'prorated',
  'full_month',
  'none',
] as const satisfies readonly FirstPeriodInterest[];
