import type { QueryClient } from '@tanstack/react-query';

import { invalidateProducts } from '@/products/invalidate';

/**
 * Lo que cambia al confirmar o deshacer un pago: la proyección (el pago se mueve de fecha o de monto), los movimientos
 * (aparece o desaparece), las cuentas, las tarjetas con su plan y sus abonos (el excedente es un abono a capital) y
 * los préstamos. Con el id de la tarjeta se piden también su plan y sus abonos. No se espera: las pantallas montadas
 * se refrescan solas.
 */
export function invalidatePayments(queryClient: QueryClient, cardId?: number): void {
  invalidateProducts(queryClient);
  if (cardId !== undefined) {
    void queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'plan'] });
    void queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'capital-payments'] });
  }
}
