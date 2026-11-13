import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { FakeDb } from '../testing/fake-db';
import { CreditCard } from './entities/credit-card.entity';
import { Loan } from './entities/loan.entity';
import { Product } from './entities/product.entity';
import { LoansService, type CreateLoanInput } from './loans.service';
import { USER } from '../testing/users';

// Los préstamos de libre inversión ya en curso: crearlos, verlos (saldo, próxima cuota, cuántas faltan),
// editarlos y abonarles. Los dos casos son de extractos reales, con datos redondeados.

const pesos = (n: number) => Math.round(n * 100);
const TODAY = '2026-11-01';

/** A (Rappi): pagada la cuota 6 de 19 (31 oct). Saldo 2.864.667, quedan 13, la próxima el 30 nov. */
const RAPPI: CreateLoanInput = {
  name: 'RappiPréstamo',
  bank: 'Rappi',
  last4: '1111',
  principalCents: pesos(2_864_667),
  termMonths: 13,
  firstPaymentDate: '2026-11-30',
  rate: { effectiveFrom: '2026-01-01', mv: '0.0196148' },
  fixedPaymentCents: pesos(241_510.46), // capital + interés, sin seguro
  insuranceRatePct: '0.2344', // % mensual del saldo: baja cada mes
};

/** B: 24 cuotas, 4 pagadas, quedan 20. Capital pendiente 351.236,72; cuota del banco 26.567,38 (sin seguro). */
const B: CreateLoanInput = {
  name: 'Libre inversión Nu',
  bank: 'Nu',
  last4: '2222',
  principalCents: pesos(351_236.72),
  termMonths: 20,
  firstPaymentDate: '2026-11-15',
  rate: { effectiveFrom: '2026-01-01', ea: '0.6135' },
  installmentTotalCents: pesos(26_567.38), // lo que muestra la app del banco
};

describe('préstamos de libre inversión', () => {
  let db: FakeDb;
  let service: LoansService;

  beforeEach(() => {
    db = new FakeDb();
    for (const entity of [Loan, CreditCard]) db.withoutId.add(entity);
    db.unique.set(Product, [['userId', 'kind', 'bank', 'last4']]);
    db.seed(Product, [{ id: 90, kind: 'credit_card', name: 'Nu', bank: 'Nu', last4: '4174', active: true }]);
    service = new LoansService(db.dataSource());
  });

  /** Como lo devuelve Postgres: lo que no se dio queda en null. */
  const asInDb = () => {
    for (const loan of db.rows(Loan)) {
      loan.fixedPaymentCents ??= null;
      loan.insuranceRate ??= null;
      loan.insuranceCents ??= 0;
      loan.method ??= 'fixed_installment';
    }
    for (const product of db.rows(Product)) product.active ??= true;
    for (const p of db.rows(CapitalPayment)) {
      p.expenseId ??= null;
      p.isExternal ??= false;
      p.mode ??= 'reduce_term';
    }
  };
  const create = async (data: CreateLoanInput) => {
    const { id } = await service.create(USER, data);
    asInDb();
    return id;
  };
  const prepay = (productId: number, mode: 'reduce_term' | 'reduce_payment', amount: number, date = '2026-11-10') => {
    db.seed(CapitalPayment, [
      ...db.rows(CapitalPayment),
      Object.assign(new CapitalPayment(), {
        id: db.rows(CapitalPayment).length + 1,
        productId,
        date,
        amountCents: pesos(amount),
        mode,
        expenseId: null,
        isExternal: false,
        sourceAccountId: null,
      }),
    ]);
  };

  describe('crear con la cuota total', () => {
    it('B: la API resta el seguro (0) y guarda la cuota del banco', async () => {
      await create(B);
      expect(db.rows(Loan)[0]).toMatchObject({ fixedPaymentCents: pesos(26_567.38), insuranceCents: 0 });
    });

    it('con seguro fijo: cuota total − seguro', async () => {
      await create({ ...B, installmentTotalCents: pesos(30_000), insuranceCents: pesos(3_432.62) });
      expect(db.rows(Loan)[0]).toMatchObject({ fixedPaymentCents: pesos(26_567.38), insuranceCents: pesos(3_432.62) });
    });

    it('A: el seguro por porcentaje se guarda como fracción (0,2344 % = 0.002344)', async () => {
      await create(RAPPI);
      expect(db.rows(Loan)[0]?.insuranceRate?.toFixed()).toBe('0.002344');
      expect(db.rows(Loan)[0]?.insuranceCents ?? 0).toBe(0);
    });

    it('400: cuota total igual o menor que el seguro; las dos cuotas; cuota total con seguro por porcentaje', async () => {
      await expect(
        service.create(USER, { ...B, installmentTotalCents: pesos(3_000), insuranceCents: pesos(3_000) }),
      ).rejects.toThrow(/mayor que el seguro/);
      await expect(service.create(USER, { ...B, fixedPaymentCents: pesos(26_000) })).rejects.toThrow(/no las dos/);
      await expect(service.create(USER, { ...B, insuranceRatePct: '0.2344' })).rejects.toThrow(/porcentaje/);
      await expect(service.create(USER, { ...RAPPI, insuranceCents: pesos(7_000) })).rejects.toThrow(
        /monto fijo o un porcentaje/,
      );
      await expect(service.create(USER, { ...RAPPI, insuranceRatePct: '2,3' })).rejects.toThrow(BadRequestException);
      expect(db.rows(Loan)).toHaveLength(0);
    });

    it('0 % de seguro es lo mismo que sin seguro por porcentaje', async () => {
      await create({ ...RAPPI, insuranceRatePct: '0' });
      expect(db.rows(Loan)[0]?.insuranceRate).toBeNull();
    });
  });

  describe('GET /loans', () => {
    it('un préstamo registrado hoy con la próxima cuota hoy (la tasa nace después del inicio del periodo) no falla', async () => {
      await create({
        ...B,
        principalCents: pesos(351_236.72),
        firstPaymentDate: '2026-11-12',
        installmentTotalCents: pesos(26_611.73),
        rate: { effectiveFrom: '2026-11-12', ea: '0.6135' },
      });
      const [loan] = await service.listActive(USER, '2026-11-12');
      expect(loan).toMatchObject({ remainingInstallments: 19, installmentCents: pesos(26_611.73) });
    });
    it('A: saldo, próxima cuota, cuotas restantes y fin', async () => {
      const id = await create(RAPPI);
      const [a] = await service.listActive(USER, TODAY);

      expect(a).toMatchObject({
        id,
        name: 'RappiPréstamo',
        bank: 'Rappi',
        last4: '1111',
        balanceCents: pesos(2_864_667), // nada vence aún: el saldo es el de hoy
        nextDueDate: '2026-11-30',
        remainingInstallments: 13,
        endDate: '2027-11-30',
        rate: { mv: '0.0196148' },
      });
      // La cuota completa = capital + interés del banco + seguro (≈ 0,2344 % de 2.864.667 = unos 6.715)
      expect(a?.insuranceCents).toBeGreaterThan(pesos(6_700));
      expect(a?.insuranceCents).toBeLessThan(pesos(6_730));
      expect(a?.installmentCents).toBe(pesos(241_510.46) + (a?.insuranceCents ?? 0));
    });

    it('B: 20 cuotas restantes y su cuota es la del banco, no la que calcularía el motor', async () => {
      await create(B);
      const [b] = await service.listActive(USER, TODAY);

      expect(b).toMatchObject({
        remainingInstallments: 20,
        nextDueDate: '2026-11-15',
        balanceCents: pesos(351_236.72),
      });
      expect(b?.installmentCents).toBe(pesos(26_567.38));
      expect(b?.endDate).toBe('2028-06-15');
    });

    it('con el tiempo: las cuotas cuyo día ya pasó se dan por pagadas y el saldo baja', async () => {
      await create(B);
      const [b] = await service.listActive(USER, '2026-12-20'); // pasaron el 15 nov y el 15 dic

      expect(b?.remainingInstallments).toBe(18);
      expect(b?.nextDueDate).toBe('2027-01-15');
      expect(b?.balanceCents).toBeLessThan(pesos(351_236.72));
    });

    it('ordenados por nombre, solo préstamos activos', async () => {
      await create(B);
      await create(RAPPI);
      const archived = await service.create(USER, { ...B, name: 'Viejo', bank: 'X', last4: '3333' });
      db.rows(Product).find((p) => p.id === archived.id)!.active = false;
      asInDb();

      expect((await service.listActive(USER, TODAY)).map((l) => l.name)).toEqual([
        'Libre inversión Nu',
        'RappiPréstamo',
      ]);
    });
  });

  describe('GET /loans/:id', () => {
    it('el cronograma: las filas con fecha ≤ hoy van pagadas; el seguro de A baja cada mes', async () => {
      const id = await create(RAPPI);
      const detail = await service.get(USER, id, '2026-12-05'); // ya pasó la del 30 nov

      expect(detail.schedule).toHaveLength(13);
      expect(detail.schedule.map((r) => r.paid).slice(0, 3)).toEqual([true, false, false]);
      expect(detail.schedule[0]).toMatchObject({ period: 1, dueDate: '2026-11-30' });
      for (let i = 1; i < detail.schedule.length; i++) {
        expect(detail.schedule[i].insurance).toBeLessThan(detail.schedule[i - 1].insurance);
      }
      const first = detail.schedule[0];
      expect(first.total).toBe(first.payment + first.insurance);
      expect(first.payment).toBe(first.interest + first.principal);
      expect(detail.schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('trae los datos con que se creó, para el formulario de edición', async () => {
      const id = await create(RAPPI);
      expect((await service.get(USER, id, TODAY)).terms).toEqual({
        principalCents: pesos(2_864_667),
        termMonths: 13,
        firstPaymentDate: '2026-11-30',
        fixedPaymentCents: pesos(241_510.46),
        insuranceCents: 0,
        insuranceRatePct: '0.2344',
      });
    });

    it('404 si no existe o si no es un préstamo', async () => {
      await expect(service.get(USER, 999, TODAY)).rejects.toThrow(NotFoundException);
      await expect(service.get(USER, 90, TODAY)).rejects.toThrow(NotFoundException); // una tarjeta
    });
  });

  describe('PATCH /loans/:id', () => {
    it('cambiar la cuota cambia lo que ve la lista (y lo que usa la proyección: sale del mismo cronograma)', async () => {
      const id = await create(B);
      await service.update(USER, id, { fixedPaymentCents: pesos(30_000) });
      asInDb();

      const [b] = await service.listActive(USER, TODAY);
      expect(b?.installmentCents).toBe(pesos(30_000));
      expect(b?.remainingInstallments).toBeLessThan(20); // paga más: termina antes
    });

    it('null en la cuota la deja a cargo del motor', async () => {
      const id = await create(B);
      await service.update(USER, id, { fixedPaymentCents: null });
      expect(db.rows(Loan)[0]?.fixedPaymentCents).toBeNull();
    });

    it('nombre, banco y últimos 4', async () => {
      const id = await create(B);
      await service.update(USER, id, { name: 'Nu libre', last4: '5555' });
      expect(db.rows(Product).find((p) => p.id === id)).toMatchObject({ name: 'Nu libre', last4: '5555', bank: 'Nu' });
    });

    it('pasar de seguro por porcentaje a fijo (y al revés) limpia el otro', async () => {
      const id = await create(RAPPI);
      await service.update(USER, id, { insuranceCents: pesos(7_000) });
      expect(db.rows(Loan)[0]).toMatchObject({ insuranceCents: pesos(7_000), insuranceRate: null });

      await service.update(USER, id, { insuranceRatePct: '0.25' });
      expect(db.rows(Loan)[0]?.insuranceCents).toBe(0);
      expect(db.rows(Loan)[0]?.insuranceRate?.toFixed()).toBe('0.0025');

      await service.update(USER, id, { insuranceRatePct: null });
      expect(db.rows(Loan)[0]?.insuranceRate).toBeNull();
    });

    it('400 si mandan los dos seguros; 404 si no es un préstamo', async () => {
      const id = await create(RAPPI);
      await expect(service.update(USER, id, { insuranceCents: 100, insuranceRatePct: '0.2' })).rejects.toThrow(
        /no los dos/,
      );
      await expect(service.update(USER, 90, { name: 'x' })).rejects.toThrow(NotFoundException);
      await expect(service.update(USER, 999, { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('no toca el capital, las cuotas ni la primera fecha', async () => {
      const id = await create(B);
      await service.update(USER, id, { name: 'otro', fixedPaymentCents: pesos(27_000) });
      expect(db.rows(Loan)[0]).toMatchObject({
        principalCents: pesos(351_236.72),
        termMonths: 20,
        firstPaymentDate: '2026-11-15',
      });
    });
  });

  describe('abonos', () => {
    it('reducir plazo baja las cuotas restantes y deja la misma cuota', async () => {
      const id = await create(B);
      const before = (await service.listActive(USER, '2026-11-16'))[0];
      prepay(id, 'reduce_term', 100_000, '2026-11-20');
      const after = (await service.listActive(USER, '2026-11-21'))[0];

      expect(after.remainingInstallments).toBeLessThan(before.remainingInstallments - 1);
      expect(after.installmentCents).toBe(before.installmentCents);
    });

    it('reducir cuota baja la cuota y deja las mismas cuotas restantes', async () => {
      const id = await create(B);
      const before = (await service.listActive(USER, '2026-11-16'))[0];
      prepay(id, 'reduce_payment', 100_000, '2026-11-20');
      const after = (await service.listActive(USER, '2026-11-21'))[0];

      expect(after.installmentCents).toBeLessThan(before.installmentCents);
      expect(after.remainingInstallments).toBe(before.remainingInstallments - 0);
    });

    describe('vista previa', () => {
      it('reducir plazo: terminas antes y la cuota es la misma; no guarda nada', async () => {
        const id = await create(B);
        const { before, after } = await service.previewPrepayment(
          USER,
          id,
          { date: '2026-11-20', amountCents: pesos(100_000), mode: 'reduce_term' },
          '2026-11-16',
        );
        expect(after.remainingInstallments).toBeLessThan(before.remainingInstallments);
        expect(after.endDate! < before.endDate!).toBe(true);
        expect(after.installmentCents).toBe(before.installmentCents);
        expect(db.rows(CapitalPayment)).toHaveLength(0);
      });
      it('reducir cuota: la cuota baja y terminas igual', async () => {
        const id = await create(B);
        const { before, after } = await service.previewPrepayment(
          USER,
          id,
          { date: '2026-11-20', amountCents: pesos(100_000), mode: 'reduce_payment' },
          '2026-11-16',
        );
        expect(after.installmentCents).toBeLessThan(before.installmentCents);
        expect(after.endDate).toBe(before.endDate);
      });
      it('coincide con lo que da el préstamo después de registrar el abono', async () => {
        const id = await create(B);
        const preview = await service.previewPrepayment(
          USER,
          id,
          { date: '2026-11-20', amountCents: pesos(100_000), mode: 'reduce_payment' },
          '2026-11-21',
        );
        prepay(id, 'reduce_payment', 100_000, '2026-11-20');
        const [real] = await service.listActive(USER, '2026-11-21');
        expect(preview.after.installmentCents).toBe(real?.installmentCents);
        expect(preview.after.remainingInstallments).toBe(real?.remainingInstallments);
      });
      it('400 si pasa del saldo; 404 si no es un préstamo', async () => {
        const id = await create(B);
        await expect(
          service.previewPrepayment(USER, id, { date: '2026-11-20', amountCents: pesos(400_000), mode: 'reduce_term' }),
        ).rejects.toThrow(/Solo puedes abonar hasta/);
        await expect(
          service.previewPrepayment(USER, 90, { date: '2026-11-20', amountCents: 100, mode: 'reduce_term' }),
        ).rejects.toThrow(NotFoundException);
      });
    });
    it('con seguro por porcentaje, un abono también baja el seguro de la próxima cuota', async () => {
      const id = await create(RAPPI);
      const before = (await service.listActive(USER, TODAY))[0];
      prepay(id, 'reduce_payment', 500_000, '2026-11-15');
      const after = (await service.listActive(USER, TODAY))[0];

      expect(after.insuranceCents).toBeLessThan(before.insuranceCents);
      expect(after.balanceCents).toBeLessThanOrEqual(before.balanceCents);
    });
  });
});
