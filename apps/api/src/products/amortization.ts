import type {
  AmortizationMethod,
  FirstPeriodInterest,
} from '@greenlight/engine';

// Los enums de la base reflejan exactamente los tipos del motor:
// - satisfies impide poner un valor que el motor no tiene.
// - los tipos Covered* dejan de compilar si al arreglo le falta un valor del motor.
type Covers<T, A extends readonly T[]> = [Exclude<T, A[number]>] extends [never]
  ? true
  : false;
type MustBeTrue<T extends true> = T;

export const AMORTIZATION_METHODS = [
  'constant_capital',
  'fixed_installment',
] as const satisfies readonly AmortizationMethod[];
export type CoveredMethods = MustBeTrue<
  Covers<AmortizationMethod, typeof AMORTIZATION_METHODS>
>;

export const FIRST_PERIOD_INTERESTS = [
  'prorated',
  'full_month',
  'none',
] as const satisfies readonly FirstPeriodInterest[];
export type CoveredFirstPeriodInterests = MustBeTrue<
  Covers<FirstPeriodInterest, typeof FIRST_PERIOD_INTERESTS>
>;
