import type { Cents, IsoDate } from '@greenlight/engine';
import type { CapitalPayment } from '../movements/entities/capital-payment.entity';
import type { DebtPayment } from './entities/debt-payment.entity';

/** Un pago ya confirmado, para que la app muestre "Pagado el 25 nov" y ofrezca deshacerlo. */
export interface ConfirmedPaymentInfo {
  /** El id del pago: DELETE /debt-payments/:id lo deshace. */
  id: number;
  paidDate: IsoDate;
  /** Todo lo pagado, con el excedente incluido. */
  amountCents: Cents;
  /** Lo que pasó del mínimo y quedó como abono a capital. */
  excessCents: Cents;
}

/** El pago confirmado de esa fecha programada (corte o cuota), o null si todavía no se confirma. */
export function confirmedInfoOf(
  payments: readonly DebtPayment[] | undefined,
  capitalPayments: readonly CapitalPayment[],
  scheduledDate: IsoDate,
): ConfirmedPaymentInfo | null {
  const found = payments?.find((p) => p.scheduledDate === scheduledDate);
  if (found === undefined) return null;
  const excess = capitalPayments.filter((c) => c.debtPaymentId === found.id).reduce((sum, c) => sum + c.amountCents, 0);
  return { id: found.id, paidDate: found.paidDate, amountCents: found.amountCents, excessCents: excess };
}
