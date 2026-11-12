// Los dos recursos mensuales (salario/ingresos y gastos fijos) comparten pantallas: lo que cambia
// de uno a otro (ruta de la API, textos, pantallas) vive aquí, en un solo lugar.

import type { Href } from 'expo-router';

import type { FixedExpense, RecurringIncome } from '@/api/types';

export type MonthlyKind = 'income' | 'expense';
export type MonthlyItem = RecurringIncome | FixedExpense;

export const MONTHLY = {
  income: {
    /** La ruta de la API; también la llave de la consulta del listado. */
    path: '/recurring-incomes',
    section: 'Ingresos',
    /** "Nuevo ingreso", "Editar ingreso"… */
    noun: 'ingreso',
    emptyTitle: 'Configura tu salario',
    emptyText: 'Registra tu salario y otros ingresos que llegan cada mes: la proyección los cuenta desde ya.',
    addLabel: 'Agregar ingreso',
  },
  expense: {
    path: '/fixed-expenses',
    section: 'Gastos fijos',
    noun: 'gasto fijo',
    emptyTitle: 'Sin gastos fijos',
    emptyText: 'Arriendo, servicios, suscripciones: lo que pagas cada mes.',
    addLabel: 'Agregar gasto fijo',
  },
} as const satisfies Record<MonthlyKind, object>;

export const listKey = (kind: MonthlyKind) => [MONTHLY[kind].path] as const;

export function newHref(kind: MonthlyKind): Href {
  return kind === 'income' ? '/recurring-incomes/new' : '/fixed-expenses/new';
}

export function editHref(kind: MonthlyKind, id: number): Href {
  const params = { id: String(id) };
  return kind === 'income'
    ? { pathname: '/recurring-incomes/[id]', params }
    : { pathname: '/fixed-expenses/[id]', params };
}

/** De dónde sale o a dónde llega, para la fila de una lista. */
export function placeOf(kind: MonthlyKind, item: MonthlyItem): string {
  if (kind === 'income') {
    return (item as RecurringIncome).destinationAccountName ?? 'Sin cuenta destino';
  }
  const expense = item as FixedExpense;
  return expense.cardName ?? expense.accountName ?? 'Sale del saldo';
}
