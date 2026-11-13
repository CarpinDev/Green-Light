import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { rateFromMv } from '@greenlight/engine';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { FakeDb } from '../testing/fake-db';
import { CardDebtController } from './card-debt.controller';
import { CardPlanService } from './card-plan.service';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { OpeningDebtService } from './opening-debt.service';
import { USER } from '../testing/users';

// La deuda inicial por grupos de cuotas y el plan de pagos por corte. Datos ficticios.

const VISA = 1;
const OTRA = 2;
const AHORROS = 3;
const PRESTAMO = 4;
const TODAY = '2026-11-12';

describe('deuda inicial y plan de una tarjeta', () => {
  let db: FakeDb;
  let debt: OpeningDebtService;
  let plans: CardPlanService;

  beforeEach(() => {
    db = new FakeDb();
    db.withoutId.add(CreditCard);
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Nu', bank: 'Nu', last4: '1234', active: true },
      { id: OTRA, kind: 'credit_card', name: 'Otra', bank: 'B', last4: '5555', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', bank: 'B', last4: '2222', active: true },
      { id: PRESTAMO, kind: 'loan', name: 'Préstamo', bank: 'B', last4: '3333', active: true },
    ]);
    // Corte el 22 y pago el 4, como la tarjeta del ejemplo
    const card = (productId: number) => ({
      productId,
      creditLimitCents: 10_000_000_00,
      cutDay: 22,
      dueDay: 4,
      handlingFeeCents: 0,
      insuranceCents: 0,
      minPaymentMethod: 'constant_capital' as const,
      singleInstallmentInterestFree: true,
      firstPeriodInterest: 'prorated' as const,
    });
    db.seed(CreditCard, [card(VISA), card(OTRA)]);
    const { ea, mv } = rateFromMv('0.0230');
    db.seed(ProductRate, [
      { id: 1, productId: VISA, effectiveFrom: '2026-01-01', ea, mv, source: 'mv' },
      { id: 2, productId: OTRA, effectiveFrom: '2026-01-01', ea, mv, source: 'mv' },
    ]);
    debt = new OpeningDebtService(db.dataSource());
    plans = new CardPlanService(db.dataSource());
  });

  const pesos = (n: number) => n * 100;
  const THREE = {
    items: [
      { amountCents: pesos(1_900_000), installments: 2 },
      { amountCents: pesos(1_200_000), installments: 6 },
      { amountCents: pesos(830_000), installments: 12, promo: { ea: '0', description: 'Promo' } },
    ],
  };
  // En Postgres las columnas sin promoción vuelven como null; el DataSource falso las deja sin definir
  const asInDb = () => {
    for (const e of db.rows(Expense)) {
      e.promoEa ??= null;
      e.promoMv ??= null;
    }
  };
  const openingOf = (cardId: number) => db.rows(Expense).filter((e) => e.sourceProductId === cardId && e.isOpeningDebt);

  describe('POST /cards/:id/opening-debt', () => {
    it('crea un gasto por grupo, de deuda inicial, con la fecha de hoy y la promo donde la hay', async () => {
      const { ids } = await debt.replace(USER, VISA, THREE, TODAY);

      expect(ids).toHaveLength(3);
      const rows = openingOf(VISA);
      expect(rows.map((e) => [e.amountCents, e.installments])).toEqual([
        [pesos(1_900_000), 2],
        [pesos(1_200_000), 6],
        [pesos(830_000), 12],
      ]);
      expect(rows.every((e) => e.date === TODAY && e.isOpeningDebt)).toBe(true);
      expect(rows[0]?.promoEa).toBeUndefined();
      expect(rows[2]?.promoEa?.isZero()).toBe(true);
      expect(rows[2]).toMatchObject({ promoDescription: 'Promo' });
    });

    it('reemplaza la deuda anterior de esa tarjeta, y solo esa', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      await debt.replace(USER, OTRA, { items: [{ amountCents: 500, installments: 3 }] }, TODAY);
      // Un gasto normal de la misma tarjeta no es deuda inicial: no se toca
      db.seed(Expense, [
        ...db.rows(Expense),
        Object.assign(new Expense(), {
          id: 99,
          sourceProductId: VISA,
          isOpeningDebt: false,
          amountCents: 1,
          installments: 1,
        }),
      ]);

      await debt.replace(USER, VISA, { items: [{ amountCents: pesos(100), installments: 4 }] }, TODAY);

      expect(openingOf(VISA).map((e) => e.installments)).toEqual([4]);
      expect(openingOf(OTRA)).toHaveLength(1);
      expect(db.rows(Expense).some((e) => e.id === 99)).toBe(true);
    });

    it('409 si un abono a capital apunta a la deuda anterior: no cambia nada', async () => {
      const { ids } = await debt.replace(USER, VISA, THREE, TODAY);
      db.seed(CapitalPayment, [{ id: 1, productId: VISA, date: TODAY, amountCents: 1, expenseId: ids[0] ?? null }]);

      await expect(debt.replace(USER, VISA, { items: [{ amountCents: 5, installments: 1 }] }, TODAY)).rejects.toThrow(
        ConflictException,
      );
      expect(openingOf(VISA)).toHaveLength(3);
    });

    it('un abono sin compra asignada no impide reemplazar', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      db.seed(CapitalPayment, [{ id: 1, productId: VISA, date: TODAY, amountCents: 1, expenseId: null }]);
      await expect(
        debt.replace(USER, VISA, { items: [{ amountCents: 5, installments: 1 }] }, TODAY),
      ).resolves.toBeDefined();
    });

    it('todo o nada: si falla al guardar, la deuda anterior queda intacta', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      db.failOn = Expense;

      await expect(debt.replace(USER, VISA, { items: [{ amountCents: 5, installments: 1 }] }, TODAY)).rejects.toThrow();
      db.failOn = undefined;
      expect(openingOf(VISA).map((e) => e.installments)).toEqual([2, 6, 12]);
    });

    it('un elemento con una tasa mala es 400 y no toca lo que había ni crea los demás', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      const bad = {
        items: [
          { amountCents: 5, installments: 1 },
          { amountCents: 5, installments: 2, promo: { ea: '2' } },
        ],
      };
      await expect(debt.replace(USER, VISA, bad, TODAY)).rejects.toThrow(BadRequestException);
      expect(openingOf(VISA)).toHaveLength(3);
    });

    it('404 si la tarjeta no existe y 400 si el producto no es una tarjeta', async () => {
      const one = { items: [{ amountCents: 5, installments: 1 }] };
      await expect(debt.replace(USER, 999, one, TODAY)).rejects.toThrow(NotFoundException);
      await expect(debt.replace(USER, AHORROS, one, TODAY)).rejects.toThrow(BadRequestException);
      await expect(debt.replace(USER, PRESTAMO, one, TODAY)).rejects.toThrow(/tarjeta/);
      expect(db.rows(Expense)).toHaveLength(0);
    });
  });

  describe('GET /cards/:id/opening-debt', () => {
    it('devuelve los grupos con la promo como texto, y null si no la tienen', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      const groups = await debt.list(USER, VISA);
      expect(groups.map((g) => [g.amountCents, g.installments, g.promo])).toEqual([
        [pesos(1_900_000), 2, null],
        [pesos(1_200_000), 6, null],
        [pesos(830_000), 12, { ea: '0', mv: '0', description: 'Promo' }],
      ]);
    });

    it('una tarjeta sin deuda inicial da una lista vacía; 404 y 400 como el resto', async () => {
      expect(await debt.list(USER, VISA)).toEqual([]);
      await expect(debt.list(USER, 999)).rejects.toThrow(NotFoundException);
      await expect(debt.list(USER, AHORROS)).rejects.toThrow(BadRequestException);
    });

    it('no mezcla la deuda de otra tarjeta ni los gastos normales', async () => {
      await debt.replace(USER, OTRA, { items: [{ amountCents: 5, installments: 1 }] }, TODAY);
      expect(await debt.list(USER, VISA)).toEqual([]);
    });
  });

  describe('GET /cards/:id/plan', () => {
    beforeEach(() => {
      // Cada prueba arma su deuda con debt.replace: se normaliza al leer el plan
      const original = plans.plan.bind(plans);
      plans.plan = (...args) => {
        asInDb();
        return original(...args);
      };
    });

    it('con tres grupos (2, 6 y 12 cuotas) el mínimo baja cuando se terminan los grupos cortos', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      const { cuts } = await plans.plan(USER, VISA, 8, TODAY);
      const mins = cuts.map((c) => c.minimum.total);

      expect(cuts[0]?.cutDate).toBe('2026-11-22');
      expect(cuts[0]?.dueDate).toBe('2026-12-04');
      // Cortes 0 y 1: los tres grupos. Corte 2: ya terminó el de 2 cuotas
      expect(mins[0]).toBeGreaterThan(mins[2] ?? 0);
      expect(mins[1]).toBeGreaterThan(mins[2] ?? 0);
      // Cortes 2 a 5: siguen el de 6 y el de 12. Del 6 en adelante, solo el de 12
      expect(mins[5]).toBeGreaterThan(mins[6] ?? 0);
      expect(mins[6]).toBeGreaterThan(0);
      // Del segundo corte en adelante solo baja: el primero cobra menos intereses (prorratea los 10 días entre
      // la fecha de hoy y el corte), así que el segundo puede ser un poco más alto
      for (let i = 2; i < mins.length; i++) expect(mins[i]).toBeLessThanOrEqual((mins[i - 1] ?? 0) + 5); // +5: el reparto de centavos del capital
    });

    it('cada corte trae el desglose del mínimo y del pago total, y la deuda que falta', async () => {
      await debt.replace(USER, VISA, THREE, TODAY);
      const [first] = (await plans.plan(USER, VISA, 3, TODAY)).cuts;

      expect(first?.minimum.total).toBe(
        (first?.minimum.capital ?? 0) + (first?.minimum.interest ?? 0) + (first?.minimum.fees ?? 0),
      );
      // El capital del primer corte: 950.000 + 200.000 + 69.166,67 (aprox., por los centavos del reparto)
      expect(first?.minimum.capital).toBeGreaterThan(pesos(1_219_000));
      expect(first?.minimum.capital).toBeLessThan(pesos(1_219_400));
      expect(first?.fullPayment.total).toBeGreaterThan(first?.minimum.total ?? 0);
      // Lo que falta después de pagar el primer corte: el total de la deuda menos el capital ya facturado
      expect(first?.remainingDebtCents).toBe(pesos(3_930_000) - (first?.minimum.capital ?? 0));
    });

    it('un corte ya cerrado cuyo pago todavía no vence cuenta; uno con el pago vencido, no', async () => {
      await debt.replace(USER, VISA, THREE, '2026-10-12');
      // Hoy 25 de nov: el corte del 22 de oct pagó el 4 de nov (ya venció); el del 22 de nov paga el 4 de dic
      const { cuts } = await plans.plan(USER, VISA, 2, '2026-11-25');
      expect(cuts.map((c) => c.cutDate)).toEqual(['2026-11-22', '2026-12-22']);
      expect(cuts[0]?.dueDate).toBe('2026-12-04');
    });

    it('sin deuda, el mínimo es solo los cargos de la tarjeta', async () => {
      const { cuts } = await plans.plan(USER, VISA, 2, TODAY);
      expect(cuts.map((c) => c.minimum.total)).toEqual([0, 0]);
    });

    it('404 si la tarjeta no existe y 400 si el producto no es una tarjeta', async () => {
      await expect(plans.plan(USER, 999, 6, TODAY)).rejects.toThrow(NotFoundException);
      await expect(plans.plan(USER, AHORROS, 6, TODAY)).rejects.toThrow(BadRequestException);
    });

    it('el plan de una tarjeta no cuenta las compras de otra', async () => {
      await debt.replace(USER, OTRA, THREE, TODAY);
      const { cuts } = await plans.plan(USER, VISA, 2, TODAY);
      expect(cuts.map((c) => c.minimum.total)).toEqual([0, 0]);
    });
  });

  describe('la deuda inicial cobra el mes completo y cae en el extracto pendiente', () => {
    // Corte el 14 y pago el 4 (Nu), con la tarjeta prorrateando el primer periodo
    beforeEach(() => {
      for (const c of db.rows(CreditCard)) Object.assign(c, { cutDay: 14, dueDay: 4 });
      const original = plans.plan.bind(plans);
      plans.plan = (...args) => {
        asInDb();
        return original(...args);
      };
    });
    const group = { items: [{ amountCents: pesos(682_500), installments: 2, promo: { mv: '0.021' } }] };

    it('cargada el 12 nov (2 días antes del corte) el pago del 4 dic lleva capital 341.250 + interés 14.332,50', async () => {
      await debt.replace(USER, VISA, group, '2026-11-12');
      const { cuts } = await plans.plan(USER, VISA, 3, '2026-11-12');
      const dec = cuts.find((c) => c.dueDate === '2026-12-04');

      expect(dec?.minimum.capital).toBe(pesos(341_250));
      expect(dec?.minimum.interest).toBe(1_433_250);
    });

    it('cargada el 20 nov sin statementPaid también cae en el pago del 4 dic, no en el del 4 ene', async () => {
      await debt.replace(USER, VISA, group, '2026-11-20');
      expect(openingOf(VISA)[0]?.date).toBe('2026-11-14');
      const { cuts } = await plans.plan(USER, VISA, 3, '2026-11-20');

      expect(cuts[0]?.dueDate).toBe('2026-12-04');
      expect(cuts[0]?.minimum.capital).toBe(pesos(341_250));
      expect(cuts[1]?.minimum.capital).toBe(pesos(341_250));
    });

    it('con statementPaid la deuda cae en el siguiente corte', async () => {
      await debt.replace(USER, VISA, { ...group, statementPaid: true }, '2026-11-20');
      expect(openingOf(VISA)[0]?.date).toBe('2026-11-20');
      const { cuts } = await plans.plan(USER, VISA, 3, '2026-11-20');
      expect(cuts.find((c) => c.dueDate === '2026-12-04')?.minimum.capital).toBe(0);
      expect(cuts.find((c) => c.dueDate === '2027-01-04')?.minimum.capital).toBe(pesos(341_250));
    });
  });

  describe('controller: cuts', () => {
    const controller = new CardDebtController(
      {} as OpeningDebtService,
      {
        plan: (_id: number, cuts: number) => Promise.resolve({ cardId: 1, cuts: new Array(cuts) }),
      } as unknown as CardPlanService,
    );

    it('acepta de 1 a 24', async () => {
      await expect(controller.plan(USER, 1, 1)).resolves.toBeDefined();
      await expect(controller.plan(USER, 1, 24)).resolves.toBeDefined();
    });

    it('rechaza 0 y 25 con 400', () => {
      expect(() => controller.plan(USER, 1, 0)).toThrow(BadRequestException);
      expect(() => controller.plan(USER, 1, 25)).toThrow(/entre 1 y 24/);
    });
  });
});
