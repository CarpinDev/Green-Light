import { endOfMonth, shiftMonths } from './calendar';
import { type CapitalPayment, type CardPurchase, type CreditCard, type PurchaseRow, planPurchase } from './cards';
import { planCard } from './card-payments';
import { sumBy } from './collections';
import { cardEvents, fixedExpensesAsPurchases } from './debt-events';
import type { ScheduleRow } from './amortization';
import type { Cents } from './money';
import { type FixedExpense, type MonthSummary, type ProjectionInput, project } from './projection';
import { usedCredit } from './statement';

export interface InstallmentOption {
  installments: number;
  firstPayment: Cents;
  totalInterest: Cents;
  /** Capital + todos los intereses: lo que de verdad pagas por la compra. */
  totalCost: Cents;
}

export interface PurchaseSimulation {
  card: CreditCard;
  /** Compras que ya tienes en la tarjeta. */
  purchases: readonly CardPurchase[];
  payments: readonly CapitalPayment[];
  fixedExpenses: readonly FixedExpense[];
  /** Tu proyección sin los eventos de esta tarjeta. */
  baseline: ProjectionInput;
  /** La compra que estás pensando hacer. */
  candidate: CardPurchase;
  /** Meses a proyectar (6 por defecto). */
  months?: number;
}

export interface SimulationResult extends InstallmentOption {
  rows: PurchaseRow[];
  /** Cupo libre el día de la compra, antes de hacerla. */
  availableCredit: Cents;
  /** La compra no cabe en el cupo. Solo informa: la decisión es tuya. */
  exceedsLimit: boolean;
  without: MonthSummary[];
  with: MonthSummary[];
}

/** Planea la misma compra con cada plazo y devuelve lo que cuesta cada uno. */
export function compareInstallments(
  card: CreditCard,
  purchase: CardPurchase,
  options: readonly number[] = [1, 3, 6, 12],
): InstallmentOption[] {
  return options.map((installments) => ({
    installments,
    ...costOf(planPurchase(card, { ...purchase, installments })),
  }));
}

/** Qué pasa con tu cupo y tu disponible si haces la compra. No modifica nada de lo que recibe. */
export function simulatePurchase(sim: PurchaseSimulation): SimulationResult {
  const { card, purchases, payments, fixedExpenses, baseline, candidate, months = 6 } = sim;

  const rows = planPurchase(card, candidate);
  const availableCredit = card.creditLimit - creditInUse(sim);

  const to = endOfMonth(shiftMonths(baseline.asOf, months - 1, 1));
  const run = (cardPurchases: readonly CardPurchase[]): MonthSummary[] =>
    project(
      {
        ...baseline,
        extraEvents: [
          ...(baseline.extraEvents ?? []),
          ...cardEvents(card, cardPurchases, payments, fixedExpenses, baseline.asOf, to),
        ],
      },
      months,
    );

  return {
    installments: candidate.installments,
    ...costOf(rows),
    rows,
    availableCredit,
    exceedsLimit: candidate.amount > availableCredit,
    without: run(purchases),
    with: run([...purchases, candidate]),
  };
}

/** Cupo usado el día de la compra, contando los cargos fijos que van a la tarjeta. */
function creditInUse({ card, purchases, payments, fixedExpenses, candidate }: PurchaseSimulation): Cents {
  const date = candidate.date;
  const all = [
    ...purchases.filter((p) => p.cardId === card.id),
    ...fixedExpensesAsPurchases(card, fixedExpenses, date, date),
  ];
  return usedCredit(all, planCard(card, all, payments).rows, date);
}

function costOf(rows: readonly ScheduleRow[]): Omit<InstallmentOption, 'installments'> {
  const totalInterest = sumBy(rows, (r) => r.interest);
  return {
    firstPayment: rows[0]?.payment ?? 0,
    totalInterest,
    totalCost: sumBy(rows, (r) => r.capital + r.prepayment) + totalInterest,
  };
}
