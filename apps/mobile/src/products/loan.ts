// Préstamos: los textos de la lista, el cuerpo que se manda al crear o editar y el efecto de un abono. Puro.

import type { LoanEffect, LoanSummary, LoanTerms } from '@/api/types';
import { formatDayShort, formatMonth, isValidDate } from '@/dates';
import { formatCop } from '@/money';
import { percentToFraction, type RateKind } from '@/products/rates';
import type { PaymentMode } from '@/products/payment';

/** El seguro del préstamo: un monto fijo cada mes, o un porcentaje del saldo (baja cada mes con el saldo). */
export type InsuranceMode = 'fixed' | 'percent';

/** Los textos de una fila de la lista de préstamos. */
export function loanRowText(loan: LoanSummary): { installment: string; remaining: string } {
  const installment =
    loan.nextDueDate === null
      ? 'Sin cuotas pendientes'
      : `Cuota ${formatCop(loan.installmentCents)} el ${formatDayShort(loan.nextDueDate)}`;

  const n = loan.remainingInstallments;
  const count = n === 0 ? 'Ya está pagado' : n === 1 ? 'Queda 1 cuota' : `Quedan ${n} cuotas`;
  const remaining =
    n > 0 && loan.endDate !== null ? `${count} · hasta ${formatMonth(loan.endDate.slice(0, 7))}` : count;
  return { installment, remaining };
}

/**
 * Un porcentaje mensual de seguro como lo escribe el usuario ("0,2344" o "0.2344") a texto con punto, o null si
 * no sirve: la API lo guarda con hasta 4 decimales y debe ser mayor que 0 y menor que 100.
 */
export function parseInsurancePct(text: string): string | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(normalized)) return null;
  return Number(normalized) > 0 ? normalized : null;
}

/** Las cuotas que faltan: un entero de 1 a 600 (el tope de la API), o null. */
export function parseTerm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 600 ? n : null;
}

export interface LoanFormValues {
  name: string;
  bank: string;
  last4: string;
  /** El capital pendiente hoy (no la deuda total con intereses). */
  principalCents: number | null;
  percent: string;
  rateKind: RateKind;
  /** Las cuotas que faltan, como las escribe el usuario. */
  installments: string;
  /** La fecha de la próxima cuota (YYYY-MM-DD). */
  nextDate: string;
  /**
   * Con seguro fijo: la cuota TOTAL que muestra la app del banco (se manda como `installmentTotalCents` y la API
   * le resta el seguro). Con seguro por porcentaje: la cuota SIN seguro (capital + interés), porque la del extracto
   * trae el seguro de un saldo anterior y la resta no cuadraría. Opcional: vacía, la calcula el motor.
   */
  installmentCents: number | null;
  insuranceMode: InsuranceMode;
  insuranceCents: number | null;
  insurancePct: string;
  /** Hoy: desde cuándo rige la tasa. */
  today: string;
}

export type LoanBodyResult = { body: object; error?: undefined } | { body?: undefined; error: string };

/** El cuerpo de POST /loans, o el error que se le muestra al usuario. */
export function loanBody(v: LoanFormValues): LoanBodyResult {
  if (v.name.trim() === '') return { error: 'Ponle un nombre al préstamo (ej. Libre inversión Nu).' };
  if (v.bank.trim() === '') return { error: 'Escribe el banco.' };
  if (!/^\d{4}$/.test(v.last4)) return { error: 'Escribe los últimos 4 dígitos del número del préstamo.' };
  if (v.principalCents === null || v.principalCents === 0) return { error: 'Escribe el capital pendiente de hoy.' };
  const fraction = percentToFraction(v.percent);
  if (fraction === null) return { error: 'Escribe la tasa como porcentaje menor a 100, por ejemplo 26,66.' };
  const term = parseTerm(v.installments);
  if (term === null) return { error: 'Las cuotas que faltan van de 1 a 600.' };
  if (!isValidDate(v.nextDate)) return { error: 'Elige la fecha de la próxima cuota.' };

  const insurance = insuranceFields(v);
  if ('error' in insurance) return { error: insurance.error };
  const installment = (v.installmentCents ?? 0) > 0 ? v.installmentCents : null;
  // Con seguro fijo, la API recibe lo que ve el usuario (cuota total) y resta el seguro; con porcentaje, la cuota sin seguro
  const installmentField =
    installment === null
      ? {}
      : v.insuranceMode === 'fixed'
        ? { installmentTotalCents: installment }
        : { fixedPaymentCents: installment };

  return {
    body: {
      name: v.name.trim(),
      bank: v.bank.trim(),
      last4: v.last4,
      principalCents: v.principalCents,
      termMonths: term,
      firstPaymentDate: v.nextDate,
      rate: { effectiveFrom: v.today, [v.rateKind]: fraction },
      ...installmentField,
      ...insurance,
    },
  };
}

/** El seguro que se manda: nada si no hay, `insuranceCents` si es fijo, `insuranceRatePct` si es porcentaje. */
function insuranceFields(
  v: LoanFormValues,
): { insuranceCents?: number; insuranceRatePct?: string } | { error: string } {
  if (v.insuranceMode === 'fixed') {
    return (v.insuranceCents ?? 0) > 0 ? { insuranceCents: v.insuranceCents as number } : {};
  }
  if (v.insurancePct.trim() === '') return {};
  const pct = parseInsurancePct(v.insurancePct);
  if (pct === null) return { error: 'Escribe el seguro como porcentaje mensual del saldo, por ejemplo 0,2344.' };
  return { insuranceRatePct: pct };
}

export interface LoanEditValues {
  name: string;
  /** La cuota del banco SIN seguro (capital + interés); vacía = que la calcule el motor. */
  fixedPaymentCents: number | null;
  insuranceMode: InsuranceMode;
  insuranceCents: number | null;
  insurancePct: string;
}

/**
 * El cuerpo de PATCH /loans/:id: solo lo que cambió. Cambiar de tipo de seguro manda el nuevo y la API limpia el
 * anterior. Devuelve `{}` si no hay cambios y un error si el porcentaje no sirve.
 */
export function loanUpdateBody(current: { name: string; terms: LoanTerms }, v: LoanEditValues): LoanBodyResult {
  const { terms } = current;
  const body: Record<string, unknown> = {};

  if (v.name.trim() === '') return { error: 'Ponle un nombre al préstamo.' };
  if (v.name.trim() !== current.name) body.name = v.name.trim();

  const fixed = (v.fixedPaymentCents ?? 0) > 0 ? v.fixedPaymentCents : null;
  if (fixed !== terms.fixedPaymentCents) body.fixedPaymentCents = fixed;

  if (v.insuranceMode === 'fixed') {
    const cents = v.insuranceCents ?? 0;
    // Si antes era por porcentaje, mandar el fijo (aunque sea 0) lo cambia
    if (cents !== terms.insuranceCents || terms.insuranceRatePct !== null) body.insuranceCents = cents;
  } else {
    const text = v.insurancePct.trim();
    if (text === '') {
      if (terms.insuranceRatePct !== null) body.insuranceRatePct = null;
    } else {
      const pct = parseInsurancePct(text);
      if (pct === null) return { error: 'Escribe el seguro como porcentaje mensual del saldo, por ejemplo 0,2344.' };
      if (terms.insuranceRatePct === null || Number(pct) !== Number(terms.insuranceRatePct)) {
        body.insuranceRatePct = pct;
      }
    }
  }
  return { body };
}

/** Lo que dice la vista previa de un abono: "Terminas en marzo 2028 en vez de junio 2028" o "Tu cuota baja a $X". */
export function prepaymentEffectText(mode: PaymentMode, before: LoanEffect, after: LoanEffect): string {
  if (after.remainingInstallments === 0 && before.remainingInstallments > 0) {
    return 'Con este abono terminas de pagar el préstamo.';
  }

  if (mode === 'reduce_term') {
    const saved = before.remainingInstallments - after.remainingInstallments;
    if (saved <= 0 || after.endDate === null || before.endDate === null) return 'Este abono no cambia cuándo terminas.';
    const fewer = `${saved} ${saved === 1 ? 'cuota menos' : 'cuotas menos'}`;
    return after.endDate.slice(0, 7) === before.endDate.slice(0, 7)
      ? `Terminas ${saved === 1 ? '1 cuota' : `${saved} cuotas`} antes.`
      : `Terminas en ${formatMonth(after.endDate.slice(0, 7))} en vez de ${formatMonth(before.endDate.slice(0, 7))} (${fewer}).`;
  }

  return after.installmentCents < before.installmentCents
    ? `Tu cuota baja a ${formatCop(after.installmentCents)} (antes ${formatCop(before.installmentCents)}).`
    : 'Este abono no cambia tu cuota.';
}
