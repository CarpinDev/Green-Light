// Los tipos del JSON que responde la API. No se importan del motor: allá los Decimal son objetos y
// en el JSON llegan como texto. Dinero en centavos (enteros); fechas YYYY-MM-DD; meses YYYY-MM.

export type Light = 'green' | 'yellow' | 'red';

export type CashEventKind =
  'income' | 'expense' | 'fixed_expense' | 'loan_payment' | 'card_payment' | 'capital_payment';

export interface CashEvent {
  date: string;
  kind: CashEventKind;
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

/** Algo que usa un producto y se resuelve antes de eliminarlo o archivarlo (GET /products/:id/usage). */
export interface ProductBlocker {
  kind: 'fixed_expense' | 'recurring_income' | 'one_off_income';
  id: number;
  name: string;
}

/** Lo que se borraría con un producto y lo que lo bloquea. */
export interface ProductUsage {
  expenses: number;
  capitalPayments: number;
  balances: number;
  rates: number;
  blockers: ProductBlocker[];
}

/** Un elemento de GET /accounts: la cuenta y su saldo confirmado más reciente. */
export interface AccountSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  latestBalance: { asOf: string; balanceCents: number } | null;
}

export type AccountType = 'savings' | 'checking';
export type MinPaymentMethod = 'constant_capital' | 'fixed_installment';
export type FirstPeriodInterest = 'prorated' | 'full_month' | 'none';

/** La tasa vigente de un producto. Los decimales llegan como texto: '0.2899' es 28,99 %. */
export interface CurrentRate {
  effectiveFrom: string;
  ea: string;
  mv: string;
}

/** Un elemento de GET /cards: la tarjeta activa con todo lo editable y su tasa vigente. */
export interface CardSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  creditLimitCents: number;
  cutDay: number;
  dueDay: number;
  handlingFeeCents: number;
  insuranceCents: number;
  minPaymentMethod: MinPaymentMethod;
  singleInstallmentInterestFree: boolean;
  firstPeriodInterest: FirstPeriodInterest;
  /** null: ninguna tasa rige todavía. */
  currentRate: CurrentRate | null;
  /** La próxima tasa programada (rige desde una fecha futura); null si no hay. */
  nextRate: CurrentRate | null;
}

export type MonthlyStatus = 'upcoming' | 'active' | 'ended';

/** Lo que comparten un ingreso recurrente y un gasto fijo (GET /recurring-incomes y /fixed-expenses). */
interface MonthlyItem {
  id: number;
  name: string;
  amountCents: number;
  /** 1..31; si el mes es más corto cae el último día. */
  dayOfMonth: number;
  startDate: string;
  /** null: no termina. */
  endDate: string | null;
  /** upcoming: empieza después de hoy; active: rige hoy; ended: ya terminó. */
  status: MonthlyStatus;
}

/** El salario y otros ingresos que llegan cada mes. */
export interface RecurringIncome extends MonthlyItem {
  destinationAccountId: number | null;
  destinationAccountName: string | null;
}

/** Arriendo, servicios, suscripciones. Con tarjeta, es una compra a 1 cuota cada mes. */
export interface FixedExpense extends MonthlyItem {
  categoryId: number | null;
  cardId: number | null;
  cardName: string | null;
  /** La cuenta de la que sale; es información de origen (no cambia la proyección). */
  accountId: number | null;
  accountName: string | null;
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

/** El desglose de un pago de tarjeta (centavos). */
export interface PaymentBreakdown {
  capital: number;
  interest: number;
  fees: number;
  total: number;
}

/** Un corte de GET /cards/:id/plan. */
export interface PlanCut {
  cutDate: string;
  dueDate: string;
  /** Lo que hay que pagar para quedar al día. */
  minimum: PaymentBreakdown;
  /** Lo que hay que pagar para saldar lo facturado en este corte. */
  fullPayment: PaymentBreakdown;
  /** El capital que falta por facturar después de este corte. */
  remainingDebtCents: number;
}

/** Respuesta de GET /cards/:id/plan: los próximos pagos de la tarjeta. */
export interface CardPlan {
  cardId: number;
  cuts: PlanCut[];
}

/** Un grupo de GET /cards/:id/opening-debt (la deuda que la tarjeta ya traía). */
export interface OpeningDebtGroup {
  id: number;
  amountCents: number;
  installments: number;
  /** La tasa de la promoción, como texto ('0.2899'); null si paga la de la tarjeta. */
  promo: { ea: string; mv: string; description: string } | null;
}

/** Respuesta de POST /statement-checks. */
export interface StatementCheckResponse {
  id: number;
  check: {
    calculatedMinimum: number;
    bankMinimum: number;
    /** calculado − banco: positiva si Green Light calcula más. */
    difference: number;
    /** |diferencia| / banco, como texto ('0.0123'). */
    relativeDifference: string;
    withinTolerance: boolean;
  };
}

/** Un elemento de GET /movements: algo que ya pasó. El monto va en positivo; `direction` dice el signo. */
export interface Movement {
  /** 'expense:12', 'income:5', 'capital:3', 'recurring:2:2026-11-01', 'fixed:4:2026-11-05' */
  id: string;
  type: 'expense' | 'income' | 'capital_payment';
  direction: 'in' | 'out';
  date: string;
  amountCents: number;
  /** Vacía si no tiene: la app pone "Gasto", "Ingreso" o "Abono". */
  description: string;
  categoryName: string | null;
  /** De dónde salió o a dónde llegó. null si no se sabe. */
  product: { id: number; name: string; last4: string; kind: ProductKind } | null;
  /** Solo en gastos con tarjeta. */
  installments: number | null;
  isOpeningDebt: boolean;
  /** Una ocurrencia de lo programado (salario, gasto fijo): se calcula, no se registra. */
  scheduled: boolean;
}
