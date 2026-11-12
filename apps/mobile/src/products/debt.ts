// La deuda inicial de una tarjeta por grupos: compras con las mismas cuotas restantes, sumadas. Lógica pura
// del formulario de grupos: la suma, la validación de cada grupo y el cuerpo que espera la API.

import type { OpeningDebtGroup } from '@/api/types';
import { parseInstallments } from '@/products/logic';
import { formatPercent, percentToFraction, type RateKind } from '@/products/rates';

/** Lo que se está editando de un grupo: el monto en centavos y lo demás como lo escribe el usuario. */
export interface DebtGroupDraft {
  /** Una llave local para la lista (no va a la API). */
  key: string;
  amountCents: number | null;
  installments: string;
  hasPromo: boolean;
  promoPercent: string;
  promoKind: RateKind;
}

export const MAX_GROUPS = 30;

let counter = 0;
/** Una llave nueva para un grupo que se agrega en pantalla. */
export const newGroupKey = (): string => `new-${counter++}`;

export function emptyGroup(key: string): DebtGroupDraft {
  return { key, amountCents: null, installments: '', hasPromo: false, promoPercent: '', promoKind: 'ea' };
}

/** La suma de lo que se debe en todos los grupos (los que todavía no tienen monto cuentan 0). */
export function debtTotal(groups: readonly DebtGroupDraft[]): number {
  return groups.reduce((sum, g) => sum + (g.amountCents ?? 0), 0);
}

/** El primer error de un grupo, o null si está bien: monto mayor que 0, cuotas de 1 a 72 y, si hay promo, una tasa. */
export function validateGroup(group: DebtGroupDraft): string | null {
  if (group.amountCents === null || group.amountCents <= 0) return 'escribe cuánto falta por pagar';
  if (parseInstallments(group.installments) === null) return 'las cuotas que faltan van de 1 a 72';
  if (group.hasPromo && percentToFraction(group.promoPercent) === null) {
    return 'escribe la tasa de la promoción como porcentaje menor a 100 (ej. 0 o 1,8)';
  }
  return null;
}

/** El primer error de todos los grupos ("Grupo 2: …"), o null. Debe haber de 1 a 30. */
export function validateGroups(groups: readonly DebtGroupDraft[]): string | null {
  if (groups.length === 0) return 'Agrega al menos un grupo.';
  if (groups.length > MAX_GROUPS) return `Son demasiados grupos: el máximo es ${MAX_GROUPS}.`;
  for (const [i, group] of groups.entries()) {
    const error = validateGroup(group);
    if (error !== null) return `Grupo ${i + 1}: ${error}.`;
  }
  return null;
}

export interface OpeningDebtItemBody {
  amountCents: number;
  installments: number;
  promo?: { ea?: string; mv?: string };
}

/** El cuerpo de un grupo para la API; con promo, la tasa va como texto ('0.018'). Un grupo inválido da null. */
export function groupBody(group: DebtGroupDraft): OpeningDebtItemBody | null {
  const installments = parseInstallments(group.installments);
  if (group.amountCents === null || group.amountCents <= 0 || installments === null) return null;

  if (!group.hasPromo) return { amountCents: group.amountCents, installments };
  const fraction = percentToFraction(group.promoPercent);
  if (fraction === null) return null;
  return { amountCents: group.amountCents, installments, promo: { [group.promoKind]: fraction } };
}

/** El cuerpo de POST /cards/:id/opening-debt, o null si algún grupo no vale (validateGroups dice cuál). */
export function openingDebtBody(groups: readonly DebtGroupDraft[]): { items: OpeningDebtItemBody[] } | null {
  if (validateGroups(groups) !== null) return null;
  const items = groups.map(groupBody);
  return items.every((item) => item !== null) ? { items: items as OpeningDebtItemBody[] } : null;
}

/** Los grupos que ya están guardados, como borradores para editarlos. La promo vuelve como E.A. en porcentaje. */
export function groupsFromApi(items: readonly OpeningDebtGroup[]): DebtGroupDraft[] {
  return items.map((item) => ({
    key: `saved-${item.id}`,
    amountCents: item.amountCents,
    installments: String(item.installments),
    hasPromo: item.promo !== null,
    promoPercent: item.promo === null ? '' : formatPercent(item.promo.ea).replace(/ %$/, ''),
    promoKind: 'ea' as const,
  }));
}
