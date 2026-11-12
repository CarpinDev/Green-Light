// La lógica pura del formulario de ingreso: la regla "ya está dentro del saldo", la cuenta que viene
// preseleccionada y la validación.

import { isValidDate } from '@/dates';

interface AccountBalances {
  id: number;
  latestBalance: { asOf: string } | null;
}

/**
 * La fecha desde la que parte la proyección: el saldo confirmado MÁS RECIENTE entre todas las cuentas
 * (null si ninguna tiene saldo). No es el de una cuenta en particular: el motor proyecta desde un solo
 * `asOf` para todas, y las cuentas con un saldo más viejo se avisan como "viejas" pero no mueven esa fecha.
 */
export function projectionAsOf(accounts: readonly AccountBalances[]): string | null {
  let latest: string | null = null;
  for (const account of accounts) {
    const asOf = account.latestBalance?.asOf;
    if (asOf !== undefined && (latest === null || asOf > latest)) latest = asOf;
  }
  return latest;
}

/**
 * ¿Un ingreso con esta fecha ya está dentro del saldo de partida? La proyección solo suma lo posterior a
 * `asOf`, así que con fecha igual o anterior no la mueve. Sin saldo (null) no hay de dónde partir: false.
 * (YYYY-MM-DD se compara como texto.)
 */
export function incomeAlreadyInBalance(date: string, asOf: string | null): boolean {
  return asOf !== null && date <= asOf;
}

/**
 * La cuenta que viene elegida: la que el usuario tocó, y si no, la única que hay (con varias, ninguna:
 * elegir una por él sería adivinar a dónde le llegó el dinero).
 */
export function selectedAccountId(accounts: readonly { id: number }[], picked: number | null): number | null {
  if (picked !== null && accounts.some((a) => a.id === picked)) return picked;
  return accounts.length === 1 ? (accounts[0]?.id ?? null) : null;
}

/** El primer error del formulario de ingreso, o null si se puede guardar. */
export function validateIncome(input: {
  amountCents: number | null;
  accountId: number | null;
  date: string;
}): string | null {
  if (input.amountCents === null || input.amountCents <= 0) return 'Escribe cuánto te entró (ej. 500.000).';
  if (input.accountId === null) return 'Elige la cuenta a la que entró el dinero.';
  if (!isValidDate(input.date)) return 'Elige una fecha válida.';
  return null;
}
