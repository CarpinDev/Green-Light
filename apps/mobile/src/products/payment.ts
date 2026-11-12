// Abonar a la deuda de una tarjeta: de dónde sale el dinero, el cuerpo que se manda y los textos. Puro.

import type { CapitalPaymentItem } from '@/api/types';

/** Una cuenta, "Externo" (plata que no pasa por tus cuentas) o nada elegido todavía. */
export type PaymentSource = { kind: 'account'; id: number } | { kind: 'external' } | null;

export type PaymentMode = 'reduce_term' | 'reduce_payment';

export const MODE_ITEMS: { value: PaymentMode; label: string }[] = [
  { value: 'reduce_term', label: 'Plazo' },
  { value: 'reduce_payment', label: 'Cuota' },
];

export const MODE_HELP: Record<PaymentMode, string> = {
  reduce_term: 'Pagas lo mismo cada mes y terminas antes.',
  reduce_payment: 'Terminas igual, pero pagas menos cada mes.',
};

/**
 * El pedazo del cuerpo que dice de dónde sale el dinero: `{ sourceAccountId }` o `{ external: true }`, nunca los dos.
 * Null si no se eligió nada (la pantalla lo trata como un error de validación: siempre se manda uno).
 */
export function sourceBody(source: PaymentSource): { sourceAccountId: number } | { external: true } | null {
  if (source === null) return null;
  return source.kind === 'account' ? { sourceAccountId: source.id } : { external: true };
}

/** El error de forma del formulario, o null si se puede enviar. */
export function validatePayment(p: { amountCents: number | null; source: PaymentSource }): string | null {
  if (p.amountCents === null || p.amountCents === 0) return 'Escribe cuánto vas a abonar.';
  if (p.source === null) return 'Elige de dónde sale el dinero (una cuenta o "Externo").';
  return null;
}

/** El cuerpo de POST /capital-payments, o null si el formulario no es válido (validatePayment dice por qué). */
export function paymentBody(p: {
  cardId: number;
  amountCents: number | null;
  source: PaymentSource;
  date: string;
  mode: PaymentMode;
}): object | null {
  const from = sourceBody(p.source);
  if (validatePayment(p) !== null || from === null) return null;
  return { productId: p.cardId, date: p.date, amountCents: p.amountCents, mode: p.mode, ...from };
}

/** "desde Ahorros ••1357", "externo" o "" (los abonos de antes no dicen de dónde salieron). */
export function sourceLabel(source: CapitalPaymentItem['source']): string {
  if (source === null) return '';
  return source.kind === 'external' ? 'externo' : `desde ${source.name} ••${source.last4}`;
}

/** "reduce el plazo" o "reduce la cuota". */
export function modeLabel(mode: PaymentMode): string {
  return mode === 'reduce_term' ? 'reduce el plazo' : 'reduce la cuota';
}
