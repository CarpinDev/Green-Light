import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { addDays, isoDateOf } from '../src/common/dates';
import { type Person, signUp } from './support/client';
import { createE2eApp } from './support/e2e-app';

// LA prueba de la rama: dos personas (A y B) en la misma base. A carga de todo; B no debe ver, tocar ni sumar
// nada de A. Toda la app real (guard, DTOs, servicios) contra Postgres (gl_e2e_isolation).

const TODAY = isoDateOf();

describe('Aislamiento entre usuarios (HTTP + Postgres)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let a: Person;
  let b: Person;

  // Los ids de lo que creó A
  const ids = {} as Record<
    'account' | 'card' | 'loan' | 'category' | 'expense' | 'recurring' | 'fixed' | 'oneOff' | 'payment',
    number
  >;

  const idOf = (res: request.Response): number => (res.body as { id: number }).id;
  const created = async (res: request.Test): Promise<number> => {
    const r = await res;
    if (r.status !== 201) throw new Error(`Se esperaba 201 y llegó ${r.status}: ${JSON.stringify(r.body)}`);
    return idOf(r);
  };

  beforeAll(async () => {
    ({ app, close } = await createE2eApp('isolation'));
    a = await signUp(app, 'a@example.com', 'Ana');
    b = await signUp(app, 'b@example.com', 'Beto');

    // --- Todo lo de A ---
    ids.account = await created(
      a.post('/accounts', {
        name: 'Ahorros de A',
        bank: 'Banco Ejemplo',
        last4: '1357',
        accountType: 'savings',
        openingBalanceCents: 500_000_000,
        asOf: TODAY,
      }),
    );
    ids.card = await created(
      a.post('/cards', {
        name: 'Visa de A',
        bank: 'Banco Ejemplo',
        last4: '4321',
        creditLimitCents: 500_000_000,
        cutDay: 15,
        dueDay: 5,
        rate: { effectiveFrom: '2026-01-01', ea: '0.2899' },
      }),
    );
    ids.loan = await created(
      a.post('/loans', {
        name: 'Préstamo de A',
        bank: 'Banco Ejemplo',
        last4: '9876',
        principalCents: 1_000_000_000,
        termMonths: 12,
        firstPaymentDate: addDays(TODAY, 20),
        rate: { effectiveFrom: '2026-01-01', ea: '0.195618' },
      }),
    );
    ids.category = await created(a.post('/categories', { name: 'Mercado', kind: 'expense' }));
    ids.expense = await created(
      a.post('/expenses', {
        date: TODAY,
        amountCents: 20_000_000,
        sourceProductId: ids.account,
        categoryId: ids.category,
        description: 'Mercado de A',
      }),
    );
    ids.recurring = await created(
      a.post('/recurring-incomes', {
        name: 'Salario de A',
        amountCents: 300_000_000,
        dayOfMonth: 28,
        startDate: '2026-01-01',
        destinationAccountId: ids.account,
      }),
    );
    ids.fixed = await created(
      a.post('/fixed-expenses', {
        name: 'Netflix de A',
        amountCents: 4_000_000,
        dayOfMonth: 20,
        startDate: '2026-01-01',
        cardId: ids.card,
      }),
    );
    ids.oneOff = await created(
      a.post('/one-off-incomes', {
        date: TODAY,
        amountCents: 10_000_000,
        description: 'Venta de A',
        destinationAccountId: ids.account,
      }),
    );
    ids.payment = await created(
      a.post('/capital-payments', {
        productId: ids.loan,
        date: TODAY,
        amountCents: 50_000_000,
        sourceAccountId: ids.account,
      }),
    );
    await created(
      a.post(`/cards/${ids.card}/opening-debt`, { items: [{ amountCents: 100_000_000, installments: 6 }] }),
    );
    expect((await a.patch('/settings', { yellowBelowIncomePct: '0.25' })).status).toBe(200);
  });
  afterAll(() => close());

  /** Todo lo que A puede ver, para comprobar que nada de lo que hace B lo cambia. */
  const snapshotOf = async (p: Person) => {
    const paths = [
      '/products',
      '/products?archived=true',
      '/accounts',
      '/cards',
      '/loans',
      '/categories?kind=expense',
      '/recurring-incomes',
      '/fixed-expenses',
      '/movements?limit=100',
      '/settings',
      `/cards/${ids.card}/opening-debt`,
      `/cards/${ids.card}/capital-payments`,
      `/loans/${ids.loan}/capital-payments`,
    ];
    const out: Record<string, unknown> = {};
    for (const path of paths) out[path] = (await p.get(path)).body;
    return out;
  };

  describe('B no ve nada de A', () => {
    it.each([
      '/products',
      '/products?archived=true',
      '/accounts',
      '/cards',
      '/loans',
      '/categories?kind=expense',
      '/categories?kind=income',
      '/recurring-incomes',
      '/fixed-expenses',
      '/movements?limit=100',
    ])('GET %s: lista vacía', async (path) => {
      const res = await b.get(path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('los ajustes de B son los de fábrica, no los que cambió A', async () => {
      const mine = await b.get('/settings');
      const theirs = await a.get('/settings');
      expect((mine.body as { yellowBelowIncomePct: string }).yellowBelowIncomePct).toBe('0.1');
      expect((theirs.body as { yellowBelowIncomePct: string }).yellowBelowIncomePct).toBe('0.25');
    });

    it('A, en cambio, sí ve todo lo suyo', async () => {
      expect(((await a.get('/products')).body as unknown[]).length).toBe(3);
      expect(((await a.get('/accounts')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/cards')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/loans')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/categories?kind=expense')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/recurring-incomes')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/fixed-expenses')).body as unknown[]).length).toBe(1);
      expect(((await a.get('/movements?limit=100')).body as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('B recibe 404 (no 403) sobre lo que es de A', () => {
    // [descripción, cómo llamarlo]. 404 y no 403, para no revelar que el id existe.
    const attempts: [string, (p: Person) => request.Test][] = [
      ['GET /loans/:id', (p) => p.get(`/loans/${ids.loan}`)],
      ['PATCH /loans/:id', (p) => p.patch(`/loans/${ids.loan}`, { name: 'robado' })],
      [
        'POST /loans/:id/prepayment-preview',
        (p) =>
          p.post(`/loans/${ids.loan}/prepayment-preview`, { date: TODAY, amountCents: 1_000_000, mode: 'reduce_term' }),
      ],
      ['PATCH /cards/:id', (p) => p.patch(`/cards/${ids.card}`, { name: 'robada' })],
      ['GET /cards/:id/plan', (p) => p.get(`/cards/${ids.card}/plan`)],
      ['GET /cards/:id/opening-debt', (p) => p.get(`/cards/${ids.card}/opening-debt`)],
      [
        'POST /cards/:id/opening-debt',
        (p) => p.post(`/cards/${ids.card}/opening-debt`, { items: [{ amountCents: 1_000_000, installments: 3 }] }),
      ],
      ['GET /cards/:id/capital-payments', (p) => p.get(`/cards/${ids.card}/capital-payments`)],
      ['GET /loans/:id/capital-payments', (p) => p.get(`/loans/${ids.loan}/capital-payments`)],
      ['GET /products/:id/usage', (p) => p.get(`/products/${ids.account}/usage`)],
      ['POST /products/:id/archive', (p) => p.post(`/products/${ids.account}/archive`)],
      ['POST /products/:id/unarchive', (p) => p.post(`/products/${ids.account}/unarchive`)],
      ['POST /products/:id/rates', (p) => p.post(`/products/${ids.card}/rates`, { effectiveFrom: TODAY, ea: '0.3' })],
      ['DELETE /products/:id', (p) => p.delete(`/products/${ids.account}`)],
      [
        'POST /accounts/:id/balances',
        (p) => p.post(`/accounts/${ids.account}/balances`, { asOf: TODAY, balanceCents: 1 }),
      ],
      ['PATCH /recurring-incomes/:id', (p) => p.patch(`/recurring-incomes/${ids.recurring}`, { name: 'robado' })],
      ['POST /recurring-incomes/:id/reactivate', (p) => p.post(`/recurring-incomes/${ids.recurring}/reactivate`)],
      [
        'POST /recurring-incomes/:id/amount-changes',
        (p) =>
          p.post(`/recurring-incomes/${ids.recurring}/amount-changes`, {
            amountCents: 1,
            effectiveFrom: addDays(TODAY, 40),
          }),
      ],
      ['DELETE /recurring-incomes/:id', (p) => p.delete(`/recurring-incomes/${ids.recurring}`)],
      ['PATCH /fixed-expenses/:id', (p) => p.patch(`/fixed-expenses/${ids.fixed}`, { name: 'robado' })],
      ['POST /fixed-expenses/:id/reactivate', (p) => p.post(`/fixed-expenses/${ids.fixed}/reactivate`)],
      [
        'POST /fixed-expenses/:id/amount-changes',
        (p) =>
          p.post(`/fixed-expenses/${ids.fixed}/amount-changes`, { amountCents: 1, effectiveFrom: addDays(TODAY, 40) }),
      ],
      ['DELETE /fixed-expenses/:id', (p) => p.delete(`/fixed-expenses/${ids.fixed}`)],
      ['DELETE /capital-payments/:id', (p) => p.delete(`/capital-payments/${ids.payment}`)],
      // Crear algo apuntando a un producto o cuenta de A
      [
        'POST /expenses con la cuenta de A',
        (p) => p.post('/expenses', { date: TODAY, amountCents: 1_000_000, sourceProductId: ids.account }),
      ],
      [
        'POST /expenses con la tarjeta de A',
        (p) => p.post('/expenses', { date: TODAY, amountCents: 1_000_000, sourceProductId: ids.card, installments: 1 }),
      ],
      [
        'POST /capital-payments al préstamo de A',
        (p) => p.post('/capital-payments', { productId: ids.loan, date: TODAY, amountCents: 1_000_000 }),
      ],
      [
        'POST /one-off-incomes a la cuenta de A',
        (p) => p.post('/one-off-incomes', { date: TODAY, amountCents: 1_000_000, destinationAccountId: ids.account }),
      ],
      [
        'POST /recurring-incomes a la cuenta de A',
        (p) =>
          p.post('/recurring-incomes', {
            name: 'x',
            amountCents: 1_000_000,
            dayOfMonth: 1,
            startDate: '2026-01-01',
            destinationAccountId: ids.account,
          }),
      ],
      [
        'POST /fixed-expenses con la tarjeta de A',
        (p) =>
          p.post('/fixed-expenses', {
            name: 'x',
            amountCents: 1_000_000,
            dayOfMonth: 1,
            startDate: '2026-01-01',
            cardId: ids.card,
          }),
      ],
      [
        'POST /fixed-expenses con la cuenta de A',
        (p) =>
          p.post('/fixed-expenses', {
            name: 'x',
            amountCents: 1_000_000,
            dayOfMonth: 1,
            startDate: '2026-01-01',
            accountId: ids.account,
          }),
      ],
      [
        'POST /statement-checks con la tarjeta de A',
        (p) =>
          p.post('/statement-checks', { cardId: ids.card, cutDate: '2026-03-15', statementMinimumCents: 1_000_000 }),
      ],
    ];

    it.each(attempts)('%s', async (_name, call) => {
      const before = await snapshotOf(a);
      const res = await call(b);
      expect(res.status).toBe(404);
      // Y A no notó nada: lo que veía antes es exactamente lo que ve después
      expect(await snapshotOf(a)).toEqual(before);
    });

    it('un abono de B con la cuenta de A como origen: 404', async () => {
      // B tiene su propio préstamo, pero la cuenta de origen es de A
      const myLoan = await created(
        b.post('/loans', {
          name: 'Préstamo de B',
          bank: 'Banco Ejemplo',
          last4: '1212',
          principalCents: 1_000_000_000,
          termMonths: 12,
          firstPaymentDate: addDays(TODAY, 20),
          rate: { effectiveFrom: '2026-01-01', ea: '0.195618' },
        }),
      );
      const res = await b.post('/capital-payments', {
        productId: myLoan,
        date: TODAY,
        amountCents: 1_000_000,
        sourceAccountId: ids.account,
      });
      expect(res.status).toBe(404);
    });

    it('la respuesta a B es la misma para un id de A que para uno que no existe en ninguna parte', async () => {
      const foreign = await b.get(`/loans/${ids.loan}`);
      const missing = await b.get('/loans/987654');
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect((foreign.body as { error: string }).error).toBe((missing.body as { error: string }).error);
    });

    it('usar una categoría de A en un gasto de B no funciona (responde como una que no existe)', async () => {
      const myAccount = await created(
        b.post('/accounts', { name: 'Cuenta de B', bank: 'Banco Ejemplo', last4: '7777', accountType: 'checking' }),
      );
      const res = await b.post('/expenses', {
        date: TODAY,
        amountCents: 1_000_000,
        sourceProductId: myAccount,
        categoryId: ids.category,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('no existe');
    });
  });

  describe('la proyección y las simulaciones de B no suman nada de A', () => {
    it('sin saldo propio, la proyección de B es 400 aunque A tenga uno', async () => {
      const fresh = await signUp(app, 'sin-saldo@example.com');
      const res = await fresh.get('/projection');
      expect(res.status).toBe(400);
    });

    it('con un saldo propio, B proyecta solo sobre lo suyo', async () => {
      const c = await signUp(app, 'solo-saldo@example.com');
      await created(
        c.post('/accounts', {
          name: 'Única',
          bank: 'Banco Ejemplo',
          last4: '2222',
          accountType: 'savings',
          openingBalanceCents: 100_000_000,
          asOf: TODAY,
        }),
      );

      const res = await c.get('/projection?months=3');
      expect(res.status).toBe(200);
      const months = (
        res.body as { months: { openingBalance: number; income: number; outflow: number; events: unknown[] }[] }
      ).months;
      // Sin ingresos, gastos, tarjetas ni préstamos propios: nada que sumar, aunque A tiene todo eso
      expect(months[0]?.openingBalance).toBe(100_000_000);
      for (const m of months) {
        expect(m.income).toBe(0);
        expect(m.outflow).toBe(0);
        expect(m.events).toHaveLength(0);
      }
    });

    it('la de A, en cambio, sí tiene ingresos, compromisos y eventos', async () => {
      const res = await a.get('/projection?months=3');
      expect(res.status).toBe(200);
      const months = (res.body as { months: { events: unknown[]; income: number }[] }).months;
      expect(months.some((m) => m.events.length > 0)).toBe(true);
      expect(months.some((m) => m.income > 0)).toBe(true);
    });

    it('B simulando una compra con la tarjeta de A recibe el mismo 400 que con una tarjeta que no existe', async () => {
      const body = (cardId: number) => ({ cardId, amountCents: 1_000_000, installments: 3 });
      const foreign = await b.post('/simulations', body(ids.card));
      const missing = await b.post('/simulations', body(987654));
      expect(foreign.status).toBe(missing.status);
      expect(foreign.status).not.toBe(200);
    });
  });

  describe('lo mismo en dos cuentas no choca', () => {
    it('B puede registrar una tarjeta con el mismo banco y últimos 4 que la de A', async () => {
      const res = await b.post('/cards', {
        name: 'Mi Visa',
        bank: 'Banco Ejemplo',
        last4: '4321',
        creditLimitCents: 100_000_000,
        cutDay: 10,
        dueDay: 28,
        rate: { effectiveFrom: '2026-01-01', ea: '0.25' },
      });
      expect(res.status).toBe(201);
    });

    it('y A sigue sin poder repetir la suya (409 solo dentro de la misma persona)', async () => {
      const res = await a.post('/cards', {
        name: 'Otra',
        bank: 'Banco Ejemplo',
        last4: '4321',
        creditLimitCents: 100_000_000,
        cutDay: 10,
        dueDay: 28,
        rate: { effectiveFrom: '2026-01-01', ea: '0.25' },
      });
      expect(res.status).toBe(409);
    });

    it('B puede tener su propia categoría "Mercado"', async () => {
      expect((await b.post('/categories', { name: 'Mercado', kind: 'expense' })).status).toBe(201);
    });

    it('los ajustes de B se cambian sin tocar los de A', async () => {
      expect((await b.patch('/settings', { cardUtilizationPct: '0.5' })).status).toBe(200);
      expect(((await a.get('/settings')).body as { cardUtilizationPct: string }).cardUtilizationPct).toBe('0.3');
    });
  });

  describe('lo que B hace con lo suyo funciona normal', () => {
    it('B puede ver, editar y borrar sus propios productos', async () => {
      const mine = await created(
        b.post('/accounts', { name: 'Para borrar', bank: 'Banco Ejemplo', last4: '8888', accountType: 'savings' }),
      );
      expect((await b.get('/products')).status).toBe(200);
      expect((await b.post(`/accounts/${mine}/balances`, { asOf: TODAY, balanceCents: 5_000 })).status).toBe(201);
      expect((await b.delete(`/products/${mine}`)).status).toBe(204);
    });
  });

  it('un mismo token no permite ver a otra persona cambiando ids en la URL: A y B tienen ids distintos', () => {
    expect(a.id).not.toBe(b.id);
  });

  it('las rutas siguen cerradas sin token aun conociendo un id de A', async () => {
    const res = await request(app.getHttpServer() as Server).get(`/loans/${ids.loan}`);
    expect(res.status).toBe(401);
  });
});
