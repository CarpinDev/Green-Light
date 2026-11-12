import { describe, expect, it } from 'vitest';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import { type CardPurchase, type CreditCard, type FirstPeriodInterest } from '../src/cards';
import { planCard } from '../src/card-payments';
import { statement } from '../src/statement';
import { nthCutAfter } from '../src/calendar';
import type { AmortizationMethod } from '../src/amortization';

// Agrupar compras con las mismas cuotas restantes y la misma tasa: ¿da lo mismo que tenerlas separadas?
// Es lo que permite registrar la deuda inicial de una tarjeta como unos pocos grupos y no como 20 compras.

const history = new RateHistory();
history.add('2026-01-01', rateFromMv('0.0214'));

const cardWith = (
  minPaymentMethod: AmortizationMethod,
  firstPeriodInterest: FirstPeriodInterest,
  overrides: Partial<CreditCard> = {},
): CreditCard => ({
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates: history,
  minPaymentMethod,
  singleInstallmentInterestFree: true,
  firstPeriodInterest,
  creditLimit: pesos(10_000_000),
  handlingFee: pesos(30_000),
  insurance: 0,
  ...overrides,
});

const purchase = (id: string, amount: number, installments: number, overrides: Partial<CardPurchase> = {}): CardPurchase => ({
  id,
  cardId: 'card-1',
  date: '2026-11-12',
  amount,
  installments,
  ...overrides,
});

/** Lo que cada corte pide: mínimo, intereses y total, más el pago total que salda lo facturado. */
function cuts(card: CreditCard, purchases: CardPurchase[], count = 14) {
  const { rows } = planCard(card, purchases, []);
  const first = nthCutAfter('2026-11-12', card.cutDay, 0);
  return Array.from({ length: count }, (_, k) => {
    const s = statement(card, rows, nthCutAfter(first, card.cutDay, k));
    return {
      cutDate: s.cutDate,
      minCapital: s.minimum.capital,
      minInterest: s.minimum.interest,
      minTotal: s.minimum.total,
      fullTotal: s.fullPayment.total,
    };
  });
}

const METHODS: AmortizationMethod[] = ['constant_capital', 'fixed_installment'];
const FIRST_PERIODS: FirstPeriodInterest[] = ['prorated', 'full_month', 'none'];

type Cut = ReturnType<typeof cuts>[number];

/**
 * Agrupar es exacto salvo por el redondeo a centavos: cada compra redondea sus intereses y reparte el residuo
 * de su capital (`floor(capital * k / cuotas)`) por su cuenta, así que dos compras separadas pueden mover 1
 * centavo de un corte al siguiente respecto de una sola agrupada. Además la cuota fija se calcula redondeada y
 * la última cuota absorbe lo que sobre. El total de capital no cambia; la diferencia por corte es de unos
 * pocos centavos: a lo sumo 1 por compra y por cuota (`tolerance`), contra montos de millones de pesos.
 */
function expectEquivalent(separate: Cut[], grouped: Cut[], tolerance: number) {
  expect(separate.map((c) => c.cutDate)).toEqual(grouped.map((c) => c.cutDate));
  separate.forEach((cut, i) => {
    const g = grouped[i] as Cut;
    expect(Math.abs(cut.minCapital - g.minCapital)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(cut.minInterest - g.minInterest)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(cut.minTotal - g.minTotal)).toBeLessThanOrEqual(2 * tolerance);
    expect(Math.abs(cut.fullTotal - g.fullTotal)).toBeLessThanOrEqual(2 * tolerance);
  });
  // El capital que se paga en total es exactamente el mismo
  const capital = (cuts: Cut[]) => cuts.reduce((sum, c) => sum + c.minCapital, 0);
  expect(capital(separate)).toBe(capital(grouped));
}

describe('agrupar compras con las mismas cuotas restantes', () => {
  for (const method of METHODS) {
    for (const firstPeriod of FIRST_PERIODS) {
      it(`${method}, primer periodo ${firstPeriod}: dos compras = una agrupada, corte a corte (salvo centavos)`, () => {
        const card = cardWith(method, firstPeriod);
        const separate = cuts(card, [purchase('a', pesos(100_000), 6), purchase('b', pesos(50_000), 6)]);
        const grouped = cuts(card, [purchase('g', pesos(150_000), 6)]);
        expectEquivalent(separate, grouped, 2 * 6);
      });

      it(`${method}, primer periodo ${firstPeriod}: con cantidades que no dividen exacto también`, () => {
        const card = cardWith(method, firstPeriod);
        const a = pesos(1_900_001) + 37;
        const b = pesos(333_333) + 11;
        expectEquivalent(
          cuts(card, [purchase('a', a, 7), purchase('b', b, 7)]),
          cuts(card, [purchase('g', a + b, 7)]),
          2 * 7,
        );
      });
    }
  }

  it('con una promoción al 0 % también: dos compras con la misma promo = una agrupada', () => {
    for (const method of METHODS) {
      const card = cardWith(method, 'prorated');
      const promoRate = rateFromMv('0');
      expectEquivalent(
        cuts(card, [
          purchase('a', pesos(400_000), 12, { promoRate }),
          purchase('b', pesos(430_000), 12, { promoRate }),
        ]),
        cuts(card, [purchase('g', pesos(830_000), 12, { promoRate })]),
        2 * 12,
      );
    }
  });

  it('veinte compras iguales = una agrupada: el error de redondeo crece a lo sumo 1 centavo por compra y por cuota', () => {
    const card = cardWith('fixed_installment', 'prorated');
    const many = Array.from({ length: 20 }, (_, i) => purchase(`p${i}`, pesos(100_000) + i * 7, 6));
    const total = many.reduce((sum, p) => sum + p.amount, 0);
    expectEquivalent(cuts(card, many), cuts(card, [purchase('g', total, 6)]), 20 * 6);
  });

  it('los grupos con distintas cuotas no se funden: el mínimo baja cuando se terminan los grupos cortos', () => {
    const card = cardWith('constant_capital', 'prorated');
    const plan = cuts(card, [
      purchase('c2', pesos(1_900_000), 2),
      purchase('c6', pesos(1_200_000), 6),
      purchase('c12', pesos(830_000), 12, { promoRate: rateFromMv('0') }),
    ]);
    const mins = plan.map((c) => c.minTotal);
    expect(mins[0]).toBeGreaterThan(mins[2] ?? 0);
    expect(mins[2]).toBeGreaterThan(mins[6] ?? 0);
  });
});
