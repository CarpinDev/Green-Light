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

/** Una opción de plazo de POST /simulations: la misma compra a 1, 3, 6 o 12 cuotas. */
export interface InstallmentOption {
  installments: number;
  firstPayment: number;
  totalInterest: number;
  /** Capital más todos los intereses: lo que de verdad pagas por la compra. */
  totalCost: number;
}

/** Respuesta de POST /simulations (no guarda nada). */
export interface SimulationResponse extends InstallmentOption {
  asOf: string;
  daysSinceBalance: number;
  options: InstallmentOption[];
  /** Las cuotas del plazo elegido; todavía no se muestran. */
  rows: unknown[];
  /** Cupo libre el día de la compra, antes de hacerla. */
  availableCredit: number;
  /** La compra no cabe en el cupo. Solo avisa: la decisión es tuya. */
  exceedsLimit: boolean;
  /** Tu proyección sin la compra y con ella, mes a mes. */
  without: MonthSummary[];
  with: MonthSummary[];
}
