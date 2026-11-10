import type { PrepaymentMode } from '@greenlight/engine';
import type { Covers, MustBeTrue } from '../common/covers';

// Igual que los enums de amortización: satisfies + Covered* amarran la base al motor
export const PREPAYMENT_MODES = [
  'reduce_term',
  'reduce_payment',
] as const satisfies readonly PrepaymentMode[];
export type CoveredPrepaymentModes = MustBeTrue<
  Covers<PrepaymentMode, typeof PREPAYMENT_MODES>
>;
