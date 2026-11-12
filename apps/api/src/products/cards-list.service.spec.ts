import { BadRequestException, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { FakeDb } from '../testing/fake-db';
import { CardsService } from './cards.service';
import { CreditCard } from './entities/credit-card.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

// Listar y editar tarjetas, y el historial de tasas. Datos ficticios.

const VISA = 1;
const MASTER = 2;
const AHORROS = 3;
const PRESTAMO = 4;
const CERRADA = 5;
const TODAY = '2026-06-15';

describe('tarjetas y tasas', () => {
  let db: FakeDb;
  let cards: CardsService;
  let products: ProductsService;

  beforeEach(() => {
    db = new FakeDb();
    db.withoutId.add(CreditCard);
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Visa', bank: 'Banco Ejemplo', last4: '4321', active: true },
      { id: MASTER, kind: 'credit_card', name: 'Master', bank: 'Banco Otro', last4: '1111', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', bank: 'Banco Ejemplo', last4: '2222', active: true },
      { id: PRESTAMO, kind: 'loan', name: 'Préstamo', bank: 'Banco Ejemplo', last4: '3333', active: true },
      { id: CERRADA, kind: 'credit_card', name: 'Vieja', bank: 'Banco Ejemplo', last4: '9999', active: false },
    ]);
    db.seed(CreditCard, [
      {
        productId: VISA,
        creditLimitCents: 500_000_000,
        cutDay: 15,
        dueDay: 5,
        handlingFeeCents: 3_000_000,
        insuranceCents: 0,
        minPaymentMethod: 'constant_capital',
        singleInstallmentInterestFree: true,
        firstPeriodInterest: 'prorated',
      },
      {
        productId: MASTER,
        creditLimitCents: 100_000_000,
        cutDay: 20,
        dueDay: 10,
        handlingFeeCents: 0,
        insuranceCents: 0,
        minPaymentMethod: 'fixed_installment',
        singleInstallmentInterestFree: false,
        firstPeriodInterest: 'none',
      },
      { productId: CERRADA, creditLimitCents: 1, cutDay: 1, dueDay: 1 },
    ]);
    db.unique.set(ProductRate, [['productId', 'effectiveFrom']]);
    cards = new CardsService(db.dataSource());
    products = new ProductsService(db.dataSource());
  });

  const rate = (productId: number, effectiveFrom: string, ea: string, mv: string) => ({
    productId,
    effectiveFrom,
    ea: new Decimal(ea),
    mv: new Decimal(mv),
    source: 'ea' as const,
  });

  describe('GET /cards', () => {
    it('solo las tarjetas activas, por nombre, con todos sus campos', async () => {
      const list = await cards.listActive(TODAY);
      expect(list.map((c) => c.name)).toEqual(['Master', 'Visa']);
      expect(list[1]).toMatchObject({
        id: VISA,
        bank: 'Banco Ejemplo',
        last4: '4321',
        creditLimitCents: 500_000_000,
        cutDay: 15,
        dueDay: 5,
        handlingFeeCents: 3_000_000,
        insuranceCents: 0,
        minPaymentMethod: 'constant_capital',
        singleInstallmentInterestFree: true,
        firstPeriodInterest: 'prorated',
      });
    });

    it('la tasa vigente es la más reciente que ya empezó: ni la futura ni la pasada vieja', async () => {
      db.seed(ProductRate, [
        rate(VISA, '2026-01-01', '0.2899', '0.0214'),
        rate(VISA, '2026-05-01', '0.2750', '0.0204'),
        rate(VISA, '2026-09-01', '0.3000', '0.0222'),
      ]);
      const [, visa] = await cards.listActive(TODAY);
      expect(visa?.currentRate).toEqual({ effectiveFrom: '2026-05-01', ea: '0.275', mv: '0.0204' });
    });

    it('una tasa que empieza hoy ya rige', async () => {
      db.seed(ProductRate, [rate(VISA, TODAY, '0.2899', '0.0214')]);
      expect((await cards.listActive(TODAY))[1]?.currentRate?.effectiveFrom).toBe(TODAY);
    });

    it('ea y mv van como texto, con todos los decimales (no number)', async () => {
      db.seed(ProductRate, [rate(VISA, '2026-01-01', '0.2899', '0.021440335512')]);
      const current = (await cards.listActive(TODAY))[1]?.currentRate;
      expect(typeof current?.ea).toBe('string');
      expect(current).toMatchObject({ ea: '0.2899', mv: '0.021440335512' });
      // Así llega al JSON, sin pasar por float
      expect(JSON.stringify(current)).toContain('"mv":"0.021440335512"');
    });

    it('sin tasa que ya rija, currentRate es null', async () => {
      db.seed(ProductRate, [rate(VISA, '2026-09-01', '0.3', '0.0222')]);
      const list = await cards.listActive(TODAY);
      expect(list.map((c) => c.currentRate)).toEqual([null, null]);
    });

    it('la tasa de otro producto no se mezcla', async () => {
      db.seed(ProductRate, [
        rate(MASTER, '2026-02-01', '0.3', '0.0222'),
        rate(PRESTAMO, '2026-03-01', '0.2', '0.0153'),
      ]);
      const [master, visa] = await cards.listActive(TODAY);
      expect(master?.currentRate?.ea).toBe('0.3');
      expect(visa?.currentRate).toBeNull();
    });
  });

  describe('PATCH /cards/:id', () => {
    it('cambia el nombre (product) y el día de corte (credit_card) juntos', async () => {
      await cards.update(VISA, { name: 'Visa Oro', cutDay: 20 });
      expect(db.rows(Product).find((p) => p.id === VISA)?.name).toBe('Visa Oro');
      expect(db.rows(CreditCard).find((c) => c.productId === VISA)).toMatchObject({
        cutDay: 20,
        dueDay: 5,
        creditLimitCents: 500_000_000,
      });
    });

    it('no toca el banco ni los últimos 4, ni las otras tarjetas', async () => {
      await cards.update(VISA, { name: 'Otra', dueDay: 8 });
      expect(db.rows(Product).find((p) => p.id === VISA)).toMatchObject({ bank: 'Banco Ejemplo', last4: '4321' });
      expect(db.rows(Product).find((p) => p.id === MASTER)?.name).toBe('Master');
      expect(db.rows(CreditCard).find((c) => c.productId === MASTER)?.dueDay).toBe(10);
    });

    it('solo el nombre, o solo campos de la tarjeta, también funcionan', async () => {
      await cards.update(VISA, { name: 'Solo nombre' });
      await cards.update(VISA, { singleInstallmentInterestFree: false, firstPeriodInterest: 'full_month' });
      expect(db.rows(Product).find((p) => p.id === VISA)?.name).toBe('Solo nombre');
      expect(db.rows(CreditCard).find((c) => c.productId === VISA)).toMatchObject({
        singleInstallmentInterestFree: false,
        firstPeriodInterest: 'full_month',
      });
    });

    it('404 si no existe o si no es una tarjeta', async () => {
      await expect(cards.update(999, { name: 'x' })).rejects.toThrow(NotFoundException);
      await expect(cards.update(AHORROS, { name: 'x' })).rejects.toThrow(NotFoundException);
      await expect(cards.update(PRESTAMO, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /products/:id/rates', () => {
    it('con la E.A. calcula la M.V. y guarda la tasa en el historial', async () => {
      const { id } = await products.addRate(VISA, { effectiveFrom: '2026-07-01', ea: '0.2899' });
      const saved = db.rows(ProductRate).find((r) => r.id === id);
      expect(saved).toMatchObject({ productId: VISA, effectiveFrom: '2026-07-01', source: 'ea' });
      expect(saved?.ea.toFixed()).toBe('0.2899');
      // M.V. = (1 + 0,2899)^(1/12) - 1, cerca de 2,14 %
      expect(saved?.mv.toFixed(4)).toBe('0.0214');
    });

    it('con la M.V. calcula la E.A.', async () => {
      await products.addRate(VISA, { effectiveFrom: '2026-07-01', mv: '0.0214' });
      const [saved] = db.rows(ProductRate);
      expect(saved?.source).toBe('mv');
      expect(saved?.ea.toFixed(2)).toBe('0.29');
    });

    it('sirve también para un préstamo', async () => {
      await expect(products.addRate(PRESTAMO, { effectiveFrom: '2026-07-01', ea: '0.2' })).resolves.toHaveProperty(
        'id',
      );
    });

    it('la misma fecha corrige la tasa: una sola fila, con los valores nuevos y replaced', async () => {
      const first = await products.addRate(VISA, { effectiveFrom: '2026-07-01', ea: '0.28' });
      expect(first.replaced).toBe(false);

      const second = await products.addRate(VISA, { effectiveFrom: '2026-07-01', mv: '0.0214' });
      expect(second).toEqual({ id: first.id, replaced: true });
      const rows = db.rows(ProductRate).filter((r) => r.productId === VISA && r.effectiveFrom === '2026-07-01');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.source).toBe('mv');
      expect(rows[0]?.mv.toFixed()).toBe('0.0214');
    });

    it('con otra fecha entra como una tasa nueva', async () => {
      await products.addRate(VISA, { effectiveFrom: '2026-07-01', ea: '0.28' });
      await expect(products.addRate(VISA, { effectiveFrom: '2026-08-01', ea: '0.29' })).resolves.toMatchObject({
        replaced: false,
      });
      expect(db.rows(ProductRate)).toHaveLength(2);
    });

    it('la misma fecha en otro producto no choca', async () => {
      await products.addRate(VISA, { effectiveFrom: '2026-07-01', ea: '0.28' });
      await expect(products.addRate(MASTER, { effectiveFrom: '2026-07-01', ea: '0.28' })).resolves.toBeDefined();
    });

    it('400 si es una cuenta: no tiene tasa', async () => {
      await expect(products.addRate(AHORROS, { effectiveFrom: '2026-07-01', ea: '0.2' })).rejects.toThrow(
        BadRequestException,
      );
      expect(db.rows(ProductRate)).toHaveLength(0);
    });

    it('404 si el producto no existe', async () => {
      await expect(products.addRate(999, { effectiveFrom: '2026-07-01', ea: '0.2' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('400 si falta la tasa o es inválida', async () => {
      await expect(products.addRate(VISA, { effectiveFrom: '2026-07-01' })).rejects.toThrow(BadRequestException);
      await expect(products.addRate(VISA, { effectiveFrom: '2026-07-01', ea: '2' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
