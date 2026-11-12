import type { QueryClient } from '@tanstack/react-query';

/**
 * Lo que cambia al crear o editar un producto: sus listas (cuentas, tarjetas), la lista general que usan
 * el formulario de gasto y el simulador, y la proyección (el cupo, las tasas y los saldos la mueven) y los movimientos recientes (un ingreso o una
 * deuda inicial aparecen ahí).
 * No se espera: las pantallas montadas se refrescan solas.
 */
export function invalidateProducts(queryClient: QueryClient): void {
  for (const key of ['accounts', 'cards', 'products', 'projection', 'movements']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
