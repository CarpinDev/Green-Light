import { describe, expect, it } from 'vitest';
import { pesos } from '../src/money';
import { RateHistory, rateFromMv } from '../src/rates';
import {
  type CapitalPayment,
  type CardPurchase,
  type CreditCard,
  planPurchase,
} from '../src/cards';
import { planCard, unbilledBalance } from '../src/card-payments';
import { usedCredit } from '../src/statement';

// Tarjeta ficticia: corte el 15, pago el 5, 2 % M.V., sin cargos
const history = new RateHistory();
history.add('2026-01-01', rateFromMv('0.02'));

const card: CreditCard = {
  id: 'card-1',
  cutDay: 15,
  dueDay: 5,
  rates: history,
  minPaymentMethod: 'constant_capital',
  singleInstallmentInterestFree: true,
  firstPeriodInterest: 'full_month',
  creditLimit: pesos(5_000_000),
  handlingFee: 0,
  insurance: 0,
};

// A: 1.200.000 a 3 cuotas con la tasa de la tarjeta (2 %). Cortes: feb 15, mar 15, abr 15
const A: CardPurchase = { id: 'A', cardId: 'card-1', date: '2026-01-20', amount: pesos(1_200_000), installments: 3 };
// P: 600.000 a 3 cuotas con promoción al 1 %. Mismos cortes
const P: CardPurchase = {
  id: 'P',
  cardId: 'card-1',
  date: '2026-01-22',
  amount: pesos(600_000),
  installments: 3,
  promoRate: rateFromMv('0.01'),
};

const pay = (overrides: Partial<CapitalPayment>): CapitalPayment => ({
  id: 'pay-1',
  cardId: 'card-1',
  date: '2026-02-20',
  amount: pesos(300_000),
  mode: 'reduce_term',
  ...overrides,
});

describe('abonos a una compra (planPurchase con abonos)', () => {
  it('sin abonos todo sigue igual', () => {
    const rows = planPurchase(card, A);
    expect(rows.every((r) => r.prepayment === 0 && r.prepaymentDate === undefined)).toBe(true);
  });

  it('un abono después del corte de febrero entra antes de la cuota 2, con su fecha', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A' })]);
    expect(rows[1]?.prepayment).toBe(pesos(300_000));
    expect(rows[1]?.prepaymentDate).toBe('2026-02-20');
    expect(rows[1]?.openingBalance).toBe(pesos(500_000));
    expect(rows[0]?.prepaymentDate).toBeUndefined();
  });

  it('reducir cuota: el saldo de 500.000 se reparte en las 2 cuotas que faltan', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A', mode: 'reduce_payment' })]);
    expect(rows.map((r) => r.capital)).toEqual([pesos(400_000), pesos(250_000), pesos(250_000)]);
  });

  it('reducir plazo: conserva 400.000 de capital y la última cuota queda en 100.000', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A', mode: 'reduce_term' })]);
    expect(rows.map((r) => r.capital)).toEqual([pesos(400_000), pesos(400_000), pesos(100_000)]);
  });

  it('un abono antes del primer corte reduce desde la cuota 1', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A', date: '2026-02-01' })]);
    expect(rows[0]?.prepayment).toBe(pesos(300_000));
    expect(rows[0]?.interest).toBe(pesos(18_000));
  });

  it('un abono el mismo día del corte llega tarde: esa cuota ya se facturó', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A', date: '2026-02-15' })]);
    expect(rows[0]?.prepayment).toBe(0);
    expect(rows[1]?.prepayment).toBe(pesos(300_000));
  });

  it('dos abonos entre los mismos cortes se suman', () => {
    const rows = planPurchase(card, A, [
      pay({ id: 'x', purchaseId: 'A', date: '2026-02-18', amount: pesos(100_000) }),
      pay({ id: 'y', purchaseId: 'A', date: '2026-03-01', amount: pesos(200_000) }),
    ]);
    expect(rows[1]?.prepayment).toBe(pesos(300_000));
    expect(rows[1]?.prepaymentDate).toBe('2026-03-01');
  });

  describe('validaciones', () => {
    it('rechaza un abono de otra compra', () => {
      expect(() => planPurchase(card, A, [pay({ purchaseId: 'P' })])).toThrow();
    });

    it('rechaza un abono anterior a la compra', () => {
      expect(() => planPurchase(card, A, [pay({ purchaseId: 'A', date: '2026-01-10' })])).toThrow(RangeError);
    });

    it('rechaza un abono cuando todas las cuotas ya se facturaron', () => {
      expect(() => planPurchase(card, A, [pay({ purchaseId: 'A', date: '2026-04-20' })])).toThrow(RangeError);
    });
  });
});

describe('unbilledBalance: lo que se puede abonar en una fecha', () => {
  const rows = planPurchase(card, A);

  it('antes del primer corte es todo el valor de la compra', () => {
    expect(unbilledBalance(rows, '2026-02-01')).toBe(pesos(1_200_000));
  });

  it('después del corte de febrero son las 2 cuotas sin facturar', () => {
    expect(unbilledBalance(rows, '2026-02-20')).toBe(pesos(800_000));
  });

  it('después del último corte es 0', () => {
    expect(unbilledBalance(rows, '2026-04-20')).toBe(0);
  });
});

describe('planCard: abonos sin compra asignada (mayor tasa primero)', () => {
  const unassigned = (amount: number) => [pay({ id: 'u', amount: pesos(amount) })];
  const prepaidBy = (rows: { purchaseId: string; prepayment: number }[], id: string) =>
    rows.filter((r) => r.purchaseId === id).reduce((acc, r) => acc + r.prepayment, 0);

  it('todo el abono va primero a la compra de mayor tasa', () => {
    const { rows, unapplied } = planCard(card, [A, P], unassigned(500_000));
    expect(prepaidBy(rows, 'A')).toBe(pesos(500_000));
    expect(prepaidBy(rows, 'P')).toBe(0);
    expect(unapplied).toEqual([]);
  });

  it('cuando la de mayor tasa queda en 0, sigue con la siguiente', () => {
    const { rows } = planCard(card, [A, P], unassigned(1_000_000));
    expect(prepaidBy(rows, 'A')).toBe(pesos(800_000));
    expect(prepaidBy(rows, 'P')).toBe(pesos(200_000));
  });

  it('lo que excede la deuda abonable se reporta como no aplicado', () => {
    const { rows, unapplied } = planCard(card, [A, P], unassigned(1_500_000));
    expect(prepaidBy(rows, 'A')).toBe(pesos(800_000));
    expect(prepaidBy(rows, 'P')).toBe(pesos(400_000));
    expect(unapplied).toHaveLength(1);
    expect(unapplied[0]?.amount).toBe(pesos(300_000));
  });

  it('a igual tasa, primero la compra más antigua', () => {
    const B: CardPurchase = { ...A, id: 'B', date: '2026-01-25' };
    const { rows } = planCard(card, [B, A], unassigned(500_000));
    expect(prepaidBy(rows, 'A')).toBe(pesos(500_000));
    expect(prepaidBy(rows, 'B')).toBe(0);
  });

  it('respeta los abonos asignados a una compra', () => {
    const { rows } = planCard(card, [A, P], [pay({ purchaseId: 'P', amount: pesos(100_000) })]);
    expect(prepaidBy(rows, 'P')).toBe(pesos(100_000));
    expect(prepaidBy(rows, 'A')).toBe(0);
  });

  it('un segundo abono ve lo que dejó el primero', () => {
    const { rows, unapplied } = planCard(card, [A, P], [
      pay({ id: 'u1', date: '2026-02-18', amount: pesos(600_000) }),
      pay({ id: 'u2', date: '2026-02-20', amount: pesos(600_000) }),
    ]);
    expect(prepaidBy(rows, 'A')).toBe(pesos(800_000)); // 600.000 + 200.000
    expect(prepaidBy(rows, 'P')).toBe(pesos(400_000));
    expect(unapplied).toEqual([]);
  });

  it('un abono asignado posterior no cuenta para el reparto de uno anterior', () => {
    const { rows } = planCard(card, [A, P], [
      pay({ id: 'late', purchaseId: 'A', date: '2026-03-01', amount: pesos(100_000) }),
      pay({ id: 'early', date: '2026-02-18', amount: pesos(800_000) }),
    ]);
    // El sin asignar toma los 800.000 completos de A; el asignado de marzo ya no cabe en A y se recorta
    expect(prepaidBy(rows, 'A')).toBe(pesos(800_000));
    expect(prepaidBy(rows, 'P')).toBe(0);
  });

  it('ignora compras y abonos de otras tarjetas', () => {
    const other: CardPurchase = { ...A, id: 'Z', cardId: 'card-2' };
    const { rows } = planCard(card, [A, other], [...unassigned(100_000), pay({ id: 'w', cardId: 'card-2' })]);
    expect(rows.some((r) => r.purchaseId === 'Z')).toBe(false);
    expect(prepaidBy(rows, 'A')).toBe(pesos(100_000));
  });

  it('rechaza un abono asignado a una compra que no existe', () => {
    expect(() => planCard(card, [A], [pay({ purchaseId: 'nope' })])).toThrow();
  });
});

describe('cupo usado con abonos', () => {
  it('el abono libera cupo el día que se hace, no en la fecha límite', () => {
    const rows = planPurchase(card, A, [pay({ purchaseId: 'A' })]);
    expect(usedCredit([A], rows, '2026-02-19')).toBe(pesos(1_200_000));
    expect(usedCredit([A], rows, '2026-02-20')).toBe(pesos(900_000));
    // 5 de marzo: se paga la cuota 1 (400.000)
    expect(usedCredit([A], rows, '2026-03-05')).toBe(pesos(500_000));
  });
});
