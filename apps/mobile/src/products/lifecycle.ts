// Eliminar y archivar un producto: los textos que la pantalla muestra antes de confirmar. Puro.

import type { ProductBlocker, ProductKind, ProductUsage } from '@/api/types';
import { formatCop } from '@/money';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Se borrarán 12 gastos, 3 tasas y 2 abonos. No se puede deshacer." Solo nombra lo que hay. */
export function usageSummary(usage: ProductUsage): string {
  const parts = [
    usage.expenses > 0 && plural(usage.expenses, 'gasto', 'gastos'),
    usage.rates > 0 && plural(usage.rates, 'tasa', 'tasas'),
    usage.capitalPayments > 0 && plural(usage.capitalPayments, 'abono', 'abonos'),
    usage.balances > 0 && plural(usage.balances, 'saldo', 'saldos'),
  ].filter((part): part is string => part !== false);

  if (parts.length === 0) return 'No tiene gastos, tasas, abonos ni saldos que borrar. No se puede deshacer.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `Se borrarán ${list}. No se puede deshacer.`;
}

const BLOCKER_LABEL: Record<ProductBlocker['kind'], string> = {
  fixed_expense: 'Gasto fijo',
  recurring_income: 'Ingreso mensual',
  one_off_income: 'Ingreso puntual',
};

/** "Gasto fijo: Arriendo" */
export function blockerLine(blocker: ProductBlocker): string {
  return `${BLOCKER_LABEL[blocker.kind]}: ${blocker.name}`;
}

/** El aviso al archivar una cuenta con saldo; null si no tiene o es cero, y para tarjetas y préstamos. */
export function archiveWarning(kind: ProductKind, balanceCents: number | null): string | null {
  if (kind !== 'account' || balanceCents === null || balanceCents === 0) return null;
  return `Su saldo de ${formatCop(balanceCents)} dejará de contar en tu proyección.`;
}
