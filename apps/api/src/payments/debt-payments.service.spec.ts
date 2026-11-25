import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { rateFromMv } from '@greenlight/engine';
import { CapitalPaymentsService } from '../movements/capital-payments.service';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { loadCardPlanFacts } from '../products/card-plan-facts';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { OTHER_USER, USER } from '../testing/users';
import { type CreateDebtPaymentInput, DebtPaymentsService } from './debt-payments.service';
import { DebtPayment } from './entities/debt-payment.entity';
import { expectedCardPayment } from './expected-payment';

// Confirmar el pago de una tarjeta o un préstamo. Reglas: el corte o la cuota tienen que ser reales; el mínimo se
// calcula con lo que ya existe; lo que pase del mínimo es un abono a capital ligado (misma transacción) y lo que falte
// se avisa. Usa el FakeDb compartido. Datos ficticios.

const VISA = 1;
const PRESTAMO = 3;
const AHORROS = 4;
const OTRA_PERSONA = 8;
const TV = 20; // compra con VISA el 2026-03-12: 1.000.000 a 3 cuotas (cortes 15 mar, 15 abr, 15 may)
const CUT = '2026-03-15';
const TODAY = '2026-03-26';

const input = (overrides: Partial<CreateDebtPaymentInput> = {}): CreateDebtPaymentInput => ({
  productId: VISA,
  scheduledDate: CUT,
  paidDate: '2026-03-25',
  amountCents: 0, // cada prueba lo fija con el mínimo real
  ...overrides,
});

describe('DebtPaymentsService', () => {
  let db: FakeDb;
  let service: DebtPaymentsService;
  let minimum: number;

  beforeEach(async () => {
    db = new FakeDb();
    for (const entity of [CreditCard, Loan]) db.withoutId.add(entity);
    db.cascades.push({ parent: DebtPayment, child: CapitalPayment, foreignKey: 'debtPaymentId' });
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Nu', last4: '4174', active: true },
      { id: PRESTAMO, kind: 'loan', name: 'Libranza', last4: '9999', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', last4: '1357', active: true },
      { id: OTRA_PERSONA, kind: 'credit_card', active: true, userId: OTHER_USER },
    ]);
    db.seed(CreditCard, [
      {
        productId: VISA,
        creditLimitCents: 500_000_000,
        cutDay: 15,
        dueDay: 5,
        handlingFeeCents: 0,
        insuranceCents: 0,
        minPaymentMethod: 'constant_capital',
        singleInstallmentInterestFree: true,
        firstPeriodInterest: 'full_month',
      },
    ]);
    db.seed(Loan, [
      {
        productId: PRESTAMO,
        principalCents: 100_000_000,
        termMonths: 12,
        firstPaymentDate: '2026-04-10',
        fixedPaymentCents: null,
        insuranceCents: 0,
        method: 'fixed_installment',
      },
    ]);
    const { ea, mv } = rateFromMv('0.02');
    db.seed(
      ProductRate,
      [VISA, PRESTAMO].map((productId, i) => ({
        id: i + 1,
        productId,
        effectiveFrom: '2026-01-01',
        ea,
        mv,
        source: 'mv' as const,
      })),
    );
    db.seed(Expense, [
      {
        id: TV,
        sourceProductId: VISA,
        date: '2026-03-12',
        installments: 3,
        amountCents: 100_000_000,
        promoEa: null,
        promoMv: null,
        isOpeningDebt: false,
      },
    ]);
    service = new DebtPaymentsService(db.dataSource(), new CapitalPaymentsService(db.dataSource()));

    const facts = await loadCardPlanFacts(db.dataSource(), USER, VISA);
    minimum = expectedCardPayment(facts, CUT)?.minimumCents ?? 0;
  });

  const create = (overrides: Partial<CreateDebtPaymentInput> = {}) =>
    service.create(USER, input({ amountCents: minimum, ...overrides }), TODAY);

  it('el corte de la prueba tiene un mínimo real', () => {
    expect(minimum).toBeGreaterThan(0);
  });

  describe('tarjeta', () => {
    it('pago exacto: se guarda sin excedente ni faltante', async () => {
      const result = await create({ sourceAccountId: AHORROS });
      expect(result).toEqual({ id: result.id, minimumCents: minimum, excessCents: 0, shortfallCents: 0 });
      expect(db.rows(DebtPayment)).toHaveLength(1);
      expect(db.rows(DebtPayment)[0]).toMatchObject({
        userId: USER,
        productId: VISA,
        scheduledDate: CUT,
        paidDate: '2026-03-25',
        amountCents: minimum,
        sourceAccountId: AHORROS,
      });
      expect(db.rows(CapitalPayment)).toHaveLength(0);
    });

    it('con excedente: crea el abono a capital ligado, en la misma fecha y origen', async () => {
      const result = await create({
        amountCents: minimum + 10_000_000,
        sourceAccountId: AHORROS,
        mode: 'reduce_payment',
      });
      expect(result).toMatchObject({ excessCents: 10_000_000, shortfallCents: 0 });
      expect(db.rows(CapitalPayment)).toHaveLength(1);
      expect(db.rows(CapitalPayment)[0]).toMatchObject({
        userId: USER,
        productId: VISA,
        date: '2026-03-25',
        amountCents: 10_000_000,
        mode: 'reduce_payment',
        sourceAccountId: AHORROS,
        debtPaymentId: result.id,
      });
    });

    it('con excedente y sin modo: el abono usa el de siempre (el motor lo trata como reduce_term)', async () => {
      await create({ amountCents: minimum + 10_000_000 });
      expect(db.rows(CapitalPayment)[0]?.mode ?? 'reduce_term').toBe('reduce_term');
    });

    it('con faltante: se guarda lo pagado y la respuesta dice cuánto faltó', async () => {
      const result = await create({ amountCents: minimum - 5_000_000 });
      expect(result).toMatchObject({ minimumCents: minimum, excessCents: 0, shortfallCents: 5_000_000 });
      expect(db.rows(DebtPayment)[0]?.amountCents).toBe(minimum - 5_000_000);
      expect(db.rows(CapitalPayment)).toHaveLength(0);
    });

    it('externo: se guarda como externo, sin cuenta', async () => {
      await create({ external: true });
      expect(db.rows(DebtPayment)[0]).toMatchObject({ isExternal: true });
      expect(db.rows(DebtPayment)[0]?.sourceAccountId ?? null).toBeNull();
    });

    it('externo con excedente: el abono también es externo', async () => {
      await create({ external: true, amountCents: minimum + 10_000_000 });
      expect(db.rows(CapitalPayment)[0]).toMatchObject({ isExternal: true });
    });

    it('un excedente que pasa de la deuda abonable es 400 y no deja nada escrito', async () => {
      await expect(create({ amountCents: minimum + 900_000_000 })).rejects.toThrow(/Solo puedes abonar hasta/);
      expect(db.rows(DebtPayment)).toHaveLength(0);
      expect(db.rows(CapitalPayment)).toHaveLength(0);
    });

    it('si el excedente falla al guardarse, el pago tampoco queda (una transacción)', async () => {
      db.failOn = CapitalPayment;
      await expect(create({ amountCents: minimum + 10_000_000 })).rejects.toThrow('la base se cayó');
      expect(db.rows(DebtPayment)).toHaveLength(0);
    });

    it('confirmar dos veces el mismo corte: 409', async () => {
      await create();
      await expect(create({ paidDate: '2026-03-26' })).rejects.toThrow(ConflictException);
      await expect(create({ paidDate: '2026-03-26' })).rejects.toThrow(
        'Ese pago ya está confirmado, bórralo para corregirlo',
      );
      expect(db.rows(DebtPayment)).toHaveLength(1);
    });

    it('un corte inventado es 400', async () => {
      await expect(create({ scheduledDate: '2026-03-16' })).rejects.toThrow(BadRequestException);
      await expect(create({ scheduledDate: '2026-03-16' })).rejects.toThrow(/no es un corte/);
    });

    it('un corte sin nada por pagar es 400', async () => {
      await expect(create({ scheduledDate: '2026-01-15' })).rejects.toThrow(/no es un corte/);
    });

    it('una fecha de pago futura es 400', async () => {
      await expect(create({ paidDate: '2026-03-27' })).rejects.toThrow(/todavía no llega/);
    });

    it('pagar antes del corte es 400', async () => {
      await expect(create({ paidDate: '2026-03-14' })).rejects.toThrow(/antes del corte/);
    });

    it('origen: cuenta y externo a la vez es 400; cuenta inactiva es 400; cuenta ajena es 404', async () => {
      await expect(create({ sourceAccountId: AHORROS, external: true })).rejects.toThrow(/no de las dos/);
      db.seed(Product, [
        ...db.rows(Product),
        { id: 9, kind: 'account', name: 'Cerrada', last4: '0000', active: false },
      ]);
      await expect(create({ sourceAccountId: 9 })).rejects.toThrow(/desactivada/);
      await expect(create({ sourceAccountId: 99 })).rejects.toThrow(NotFoundException);
      expect(db.rows(DebtPayment)).toHaveLength(0);
    });

    it('una tarjeta de otra persona es 404; una cuenta no es tarjeta ni préstamo (400)', async () => {
      await expect(create({ productId: OTRA_PERSONA })).rejects.toThrow(NotFoundException);
      await expect(create({ productId: AHORROS })).rejects.toThrow(BadRequestException);
    });
  });

  describe('préstamo', () => {
    it('la cuota (con seguro) es el mínimo: pagarla antes de tiempo está bien', async () => {
      const result = await service.create(
        USER,
        { productId: PRESTAMO, scheduledDate: '2026-04-10', paidDate: '2026-04-07', amountCents: 1 },
        '2026-04-08',
      );
      // Pagó 1 centavo: casi todo es faltante
      expect(result.excessCents).toBe(0);
      expect(result.shortfallCents).toBe(result.minimumCents - 1);
      expect(db.rows(DebtPayment)[0]).toMatchObject({ productId: PRESTAMO, paidDate: '2026-04-07' });
    });

    it('una fecha que no es una cuota es 400', async () => {
      await expect(
        service.create(
          USER,
          { productId: PRESTAMO, scheduledDate: '2026-04-11', paidDate: '2026-04-11', amountCents: 5_000_000 },
          TODAY.replace('03', '04'),
        ),
      ).rejects.toThrow(/no es la fecha de una cuota/);
    });

    it('con excedente: abono ligado al préstamo', async () => {
      const first = await service.create(
        USER,
        { productId: PRESTAMO, scheduledDate: '2026-04-10', paidDate: '2026-04-10', amountCents: 1 },
        '2026-04-10',
      );
      await service.remove(USER, first.id);
      const result = await service.create(
        USER,
        {
          productId: PRESTAMO,
          scheduledDate: '2026-04-10',
          paidDate: '2026-04-10',
          amountCents: first.minimumCents + 5_000_000,
        },
        '2026-04-10',
      );
      expect(result.excessCents).toBe(5_000_000);
      expect(db.rows(CapitalPayment)[0]).toMatchObject({
        productId: PRESTAMO,
        amountCents: 5_000_000,
        debtPaymentId: result.id,
      });
    });
  });

  describe('remove', () => {
    it('borra el pago y, en cascada, el abono de su excedente; deja los abonos sueltos', async () => {
      db.seed(CapitalPayment, [
        {
          id: 500,
          productId: VISA,
          date: '2026-03-20',
          amountCents: 1_000_000,
          debtPaymentId: null,
          expenseId: null,
          isExternal: false,
          mode: 'reduce_term' as const,
        },
      ]);
      const { id } = await create({ amountCents: minimum + 10_000_000 });
      expect(db.rows(CapitalPayment)).toHaveLength(2);

      await service.remove(USER, id);
      expect(db.rows(DebtPayment)).toHaveLength(0);
      expect(db.rows(CapitalPayment).map((p) => p.id)).toEqual([500]);
    });

    it('un pago que no existe o es de otra persona es 404', async () => {
      await expect(service.remove(USER, 999)).rejects.toThrow(NotFoundException);
      const { id } = await create();
      await expect(service.remove(OTHER_USER, id)).rejects.toThrow(NotFoundException);
      expect(db.rows(DebtPayment)).toHaveLength(1);
    });

    it('después de deshacer se puede volver a confirmar', async () => {
      const { id } = await create();
      await service.remove(USER, id);
      await expect(create({ paidDate: '2026-03-26' })).resolves.toBeDefined();
    });
  });

  describe('el abono ligado no se borra suelto', () => {
    it('DELETE de un capital_payment con debtPaymentId es 409; uno suelto sí se borra', async () => {
      const capital = new CapitalPaymentsService(db.dataSource());
      db.seed(CapitalPayment, [
        {
          id: 500,
          productId: VISA,
          date: '2026-03-20',
          amountCents: 1_000_000,
          debtPaymentId: null,
          expenseId: null,
          isExternal: false,
          mode: 'reduce_term' as const,
        },
      ]);
      await create({ amountCents: minimum + 10_000_000 });
      const linked = db.rows(CapitalPayment).find((p) => p.debtPaymentId != null);

      await expect(capital.remove(USER, linked?.id ?? 0)).rejects.toThrow(ConflictException);
      await expect(capital.remove(USER, linked?.id ?? 0)).rejects.toThrow(
        'Este abono es parte de un pago: bórralo desde el pago',
      );
      expect(db.rows(CapitalPayment)).toHaveLength(2);

      await capital.remove(USER, 500);
      expect(db.rows(CapitalPayment)).toHaveLength(1);
    });
  });
});
