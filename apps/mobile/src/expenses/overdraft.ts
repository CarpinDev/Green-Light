// ¿Este gasto te deja en negativo? Puro: el saldo y las fechas llegan como parámetros.

export interface Overdraft {
  /** Tu saldo de hoy, antes del gasto. */
  balanceCents: number;
  /** Cómo quedaría después. */
  resultCents: number;
}

/**
 * Pide confirmar solo si el gasto sale de una cuenta (uno con tarjeta no mueve el saldo hasta el pago del
 * extracto), el saldo de hoy se conoce y el monto lo supera. Igual al saldo no avisa: queda en cero. Un gasto con
 * fecha futura no baja el saldo de hoy, y uno anterior al último saldo confirmado ya está dentro de ese saldo:
 * tampoco. No bloquea: un sobregiro es posible, solo se confirma.
 */
export function overdraftCheck(p: {
  amountCents: number;
  fromCard: boolean;
  /** null: la proyección no cargó o falló; entonces no se estorba. */
  balanceCents: number | null;
  date: string;
  today: string;
  asOf: string;
}): Overdraft | null {
  if (p.fromCard || p.balanceCents === null) return null;
  if (p.date > p.today || p.date < p.asOf) return null;
  if (p.amountCents <= p.balanceCents) return null;
  return { balanceCents: p.balanceCents, resultCents: p.balanceCents - p.amountCents };
}
