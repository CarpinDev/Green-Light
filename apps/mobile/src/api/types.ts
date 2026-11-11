// Los tipos del JSON que responde la API. No se importan del motor: allá los Decimal son objetos y
// en el JSON llegan como texto. Dinero en centavos (enteros); fechas YYYY-MM-DD; meses YYYY-MM.

export type Light = 'green' | 'yellow' | 'red';

export interface CashEvent {
  date: string;
  kind: string;
  /** Con signo: negativo es una salida. */
  amount: number;
  label: string;
  refId?: string;
}

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  openingBalance: number;
  income: number;
  outflow: number;
  closingBalance: number;
  lowestBalance: number;
  /** Ausente si en el mes no pasa nada que mueva el saldo. */
  lowestBalanceDate?: string;
  referenceIncome: number;
  light: Light;
  events: CashEvent[];
}

export interface Alert {
  kind: 'card_utilization' | 'debt_to_income';
  /** El id de la tarjeta o el mes (YYYY-MM). */
  refId: string;
  /** Proporción medida, como texto: "0.4716". */
  value: string;
  threshold: string;
}

/** Respuesta de GET /projection. */
export interface ProjectionResponse {
  /** Fecha del saldo más reciente: desde ahí se proyecta. */
  asOf: string;
  /** Días entre `asOf` y hoy. */
  daysSinceBalance: number;
  openingBalanceCents: number;
  /** Ids de las cuentas cuyo último saldo es más viejo que `asOf`. */
  staleAccounts: number[];
  months: MonthSummary[];
  alerts: Alert[];
}

export type ProductKind = 'credit_card' | 'loan' | 'account';

/** Un elemento de GET /products (solo los activos). */
export interface Product {
  id: number;
  kind: ProductKind;
  name: string;
  bank: string;
  last4: string;
}

/** Un elemento de GET /categories?kind=... */
export interface Category {
  id: number;
  name: string;
}
