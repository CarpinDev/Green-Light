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
  /** Solo en `card_payment`: el corte del extracto que se paga (la `date` es su vencimiento). */
  cutDate?: string;
  /** Solo en `card_payment`: lo que saldaría todo el extracto, en positivo. */
  fullPayment?: number;
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
  /** Hoy según la API: con esta fecha se calculó el saldo actual. */
  today: string;
  /** Lo que tienes hoy: el último saldo confirmado más los movimientos que ya pasaron. */
  currentBalanceCents: number;
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
export interface MonthlyItem {
  id: number;
  name: string;
  amountCents: number;
  /** 1..31; si el mes es más corto cae el último día. */
  dayOfMonth: number;
  startDate: string;
  /** null: no termina. */
  endDate: string | null;
  /** El registro que lo reemplazó por un cambio de monto; null si no lo reemplazaron. */
  replacedById: number | null;
  /** Tiene fecha de fin y no lo reemplazó un cambio de monto: se puede reactivar. */
  canReactivate: boolean;
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

/** Un préstamo de GET /loans: todo sale del cronograma, nada se guarda calculado. */
export interface LoanSummary {
  id: number;
  name: string;
  bank: string;
  last4: string;
  rate: { ea: string; mv: string } | null;
  /** La próxima cuota completa (capital + interés + seguro); 0 si ya no quedan. */
  installmentCents: number;
  /** El seguro de la próxima cuota (con seguro por porcentaje baja cada mes). */
  insuranceCents: number;
  /** Capital que se debe hoy. */
  balanceCents: number;
  nextDueDate: string | null;
  remainingInstallments: number;
  /** La fecha de la última cuota. */
  endDate: string | null;
}

export interface LoanScheduleRow {
  period: number;
  dueDate: string;
  payment: number;
  interest: number;
  principal: number;
  insurance: number;
  total: number;
  closingBalance: number;
  prepayment: number;
  /** Su fecha ya llegó: se da por pagada. */
  paid: boolean;
}

/** Los datos con que se creó o editó el préstamo (para el formulario de edición). */
export interface LoanTerms {
  principalCents: number;
  termMonths: number;
  firstPaymentDate: string;
  fixedPaymentCents: number | null;
  insuranceCents: number;
  /** "0.2344" (% mensual del saldo); null si el seguro es fijo. */
  insuranceRatePct: string | null;
}

/** GET /loans/:id */
export interface LoanDetail extends LoanSummary {
  terms: LoanTerms;
  schedule: LoanScheduleRow[];
}

/** Lo que cambia con un abono (POST /loans/:id/prepayment-preview). */
export interface LoanEffect {
  installmentCents: number;
  remainingInstallments: number;
  endDate: string | null;
  balanceCents: number;
}

export interface LoanPrepaymentPreview {
  before: LoanEffect;
  after: LoanEffect;
}

/** Un abono de GET /cards/:id/capital-payments. `source` es null en los abonos de antes de registrar el origen. */
export interface CapitalPaymentItem {
  id: number;
  date: string;
  amountCents: number;
  mode: 'reduce_term' | 'reduce_payment';
  source: { kind: 'account'; id: number; name: string; last4: string } | { kind: 'external' } | null;
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
  /** Solo en abonos: de dónde salió el dinero, "desde Ahorros ••1357" o "externo"; null si no se sabe. */
  sourceLabel: string | null;
  /** Una ocurrencia de lo programado (salario, gasto fijo): se calcula, no se registra. */
  scheduled: boolean;
}
