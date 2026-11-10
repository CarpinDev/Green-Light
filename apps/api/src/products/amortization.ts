import type {
  AmortizationMethod,
  FirstPeriodInterest,
} from '@greenlight/engine';
import type { Covers, MustBeTrue } from '../common/covers';

// Los enums de la base reflejan exactamente los tipos del motor:
// - satisfies impide poner un valor que el motor no tiene.
// - los tipos Covered* dejan de compilar si al arreglo le falta un valor del motor.

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
