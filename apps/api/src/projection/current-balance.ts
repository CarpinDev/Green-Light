import type { Cents, IsoDate, MonthSummary } from '@greenlight/engine';

/**
 * El saldo de hoy: el último saldo confirmado más lo que ya pasó desde entonces. Los eventos de los meses
 * proyectados ya son solo los que cuentan (los posteriores al saldo y, del mismo día, los registrados después de
 * confirmarlo), así que basta sumar los que tienen fecha de hoy o anterior. Lo futuro no entra, y un gasto con
 * tarjeta tampoco hasta el día en que se paga el extracto: hasta entonces no salió plata de la cuenta.
 *
 * Es una función pura sobre la proyección y no un saldo que se vaya actualizando: así corregir o borrar un
 * gasto cambia el resultado solo, y lo del mismo día se desempata con la hora de registro (que ya resolvió
 * `afterBalance` al armar la entrada). Está aparte de build-projection.ts para que esa regla se lea y se pruebe sola.
 */
export function currentBalance(openingBalanceCents: Cents, months: readonly MonthSummary[], today: IsoDate): Cents {
  return months
    .flatMap((month) => month.events)
    .filter((event) => event.date <= today)
    .reduce((balance, event) => balance + event.amount, openingBalanceCents);
}
