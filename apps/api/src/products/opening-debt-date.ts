import { dueDateFor, shiftMonths } from '@greenlight/engine';

/**
 * La fecha con la que se guarda la deuda inicial de una tarjeta.
 *
 * Cada grupo son "las cuotas que faltan, contando la del próximo pago". Si hoy el último corte ya cerró pero su
 * pago todavía no vence (y no lo has pagado), ese extracto es el "próximo pago": la fecha de la deuda es la del
 * corte, y sus cuotas caen en ese extracto. En cualquier otro caso la deuda cae en el siguiente corte (hoy).
 */
export function openingDebtDate(today: string, cutDay: number, dueDay: number, statementPaid = false): string {
  // El último corte que ya ocurrió (≤ hoy); en meses cortos el día se ajusta (corte 31 en febrero = 28)
  const thisMonth = shiftMonths(today, 0, cutDay);
  const lastCut = thisMonth <= today ? thisMonth : shiftMonths(today, -1, cutDay);

  const pending = dueDateFor(lastCut, dueDay) >= today;
  return pending && !statementPaid ? lastCut : today;
}
