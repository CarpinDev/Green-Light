import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as argon2 from 'argon2';
import Decimal from 'decimal.js';
import { DataSource, type MigrationInterface } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { FixedExpense } from '../src/incomes/entities/fixed-expense.entity';
import { OneOffIncome } from '../src/incomes/entities/one-off-income.entity';
import { RecurringIncome } from '../src/incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../src/movements/entities/capital-payment.entity';
import { Category } from '../src/movements/entities/category.entity';
import { Expense } from '../src/movements/entities/expense.entity';
import { AccountBalance } from '../src/products/entities/account-balance.entity';
import { Account } from '../src/products/entities/account.entity';
import { CreditCard } from '../src/products/entities/credit-card.entity';
import { Loan } from '../src/products/entities/loan.entity';
import { ProductRate } from '../src/products/entities/product-rate.entity';
import { Product } from '../src/products/entities/product.entity';
import { StatementCheck } from '../src/products/entities/statement-check.entity';
import { buildProjection } from '../src/projection/build-projection';
import { ProjectionService } from '../src/projection/projection.service';
import { Settings } from '../src/settings/entities/settings.entity';
import { AHORROS, NOMINA, PRESTAMO, VISA, facts, make, pesos } from '../src/testing/projection-facts';
import { User } from '../src/users/entities/user.entity';
import { connect, freshDatabase, type TestDbSettings } from './support/test-db';

// La migración AddUsers contra Postgres de verdad: se crea el esquema de ANTES (las migraciones previas), se siembran
// datos como los de hoy con SQL, se corre AddUsers y se comprueba que todo quedó asignado a la dueña, que las
// restricciones son las esperadas y que la proyección da exactamente lo mismo. Una base desechable por prueba.

const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'database', 'migrations');
const ADD_USERS_FILE = '1794900000000-AddUsers.ts';
const TODAY = '2026-03-12';
const OWNER_PASSWORD = 'la-clave-de-la-duena-123';

/** Las tablas con datos propios (todas menos settings, que cambia de llave). */
const OWNED_TABLES = [
  'product',
  'product_rate',
  'statement_check',
  'category',
  'expense',
  'account_balance',
  'capital_payment',
  'one_off_income',
  'fixed_expense',
  'recurring_income',
];
const ALL_TABLES = [...OWNED_TABLES, 'settings'];

const ENTITIES = [
  User,
  Product,
  CreditCard,
  Loan,
  Account,
  AccountBalance,
  ProductRate,
  Expense,
  Category,
  CapitalPayment,
  OneOffIncome,
  RecurringIncome,
  FixedExpense,
  StatementCheck,
  Settings,
];

/** Las clases de migración de un archivo (cada archivo exporta una). */
function migrationsFrom(files: string[]): (new () => MigrationInterface)[] {
  return files.map((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(join(MIGRATIONS_DIR, file)) as Record<string, new () => MigrationInterface>;
    return Object.values(exported)[0];
  });
}
const allFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

function dataSourceFor(db: TestDbSettings, files: string[]): DataSource {
  return new DataSource({
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.database,
    ssl: false,
    entities: ENTITIES,
    migrations: migrationsFrom(files),
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
  });
}

/** La base tal como está HOY en producción: todas las migraciones menos AddUsers. */
async function legacyDatabase(suffix: string): Promise<TestDbSettings> {
  const db = await freshDatabase(`migration_${suffix}`);
  const before = dataSourceFor(
    db,
    allFiles().filter((f) => f !== ADD_USERS_FILE),
  );
  await before.initialize();
  await before.runMigrations();
  await before.destroy();
  return db;
}

/** Corre lo que falta (AddUsers) y devuelve el error si lo hay. */
async function runAddUsers(db: TestDbSettings): Promise<Error | undefined> {
  const ds = dataSourceFor(db, allFiles());
  await ds.initialize();
  try {
    await ds.runMigrations();
    return undefined;
  } catch (err) {
    return err as Error;
  } finally {
    await ds.destroy();
  }
}

// --- Datos como los de hoy: lo del fixture de proyección + una categoría, otro gasto, un ingreso puntual y un extracto ---

const MARKET_EXPENSE = make(Expense, {
  id: 11,
  date: '2026-03-11',
  amountCents: pesos(150_000),
  sourceProductId: AHORROS,
  categoryId: 1,
  description: 'Mercado',
  installments: null,
  promoEa: null,
  promoMv: null,
});
const SALE = make(OneOffIncome, {
  id: 1,
  date: '2026-03-20',
  amountCents: pesos(500_000),
  description: 'Venta',
  categoryId: null,
  destinationAccountId: AHORROS,
});
const CUSTOM_YELLOW = '0.1500';

async function seedLegacy(db: TestDbSettings): Promise<void> {
  const c = await connect(db);
  const f = facts();
  try {
    const productRows: [number, string, string, string, boolean][] = [
      [VISA, 'credit_card', 'Visa', '1111', true],
      [PRESTAMO, 'loan', 'Préstamo', '2222', true],
      [AHORROS, 'account', 'Ahorros', '3333', true],
      [NOMINA, 'account', 'Nómina', '4444', true],
      [5, 'account', 'Cuenta archivada', '5555', false],
    ];
    for (const [id, kind, name, last4, active] of productRows) {
      await c.query(
        `INSERT INTO product (id, kind, name, bank, last4, active) VALUES ($1, $2, $3, 'Banco Ejemplo', $4, $5)`,
        [id, kind, name, last4, active],
      );
    }
    const card = f.cards[0];
    await c.query(
      `INSERT INTO credit_card (product_id, credit_limit_cents, cut_day, due_day, handling_fee_cents, insurance_cents, min_payment_method, single_installment_interest_free, first_period_interest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        VISA,
        card.creditLimitCents,
        card.cutDay,
        card.dueDay,
        card.handlingFeeCents,
        card.insuranceCents,
        card.minPaymentMethod,
        card.singleInstallmentInterestFree,
        card.firstPeriodInterest,
      ],
    );
    const loan = f.loans[0];
    await c.query(
      `INSERT INTO loan (product_id, principal_cents, term_months, first_payment_date, fixed_payment_cents, insurance_cents, method)
       VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
      [PRESTAMO, loan.principalCents, loan.termMonths, loan.firstPaymentDate, loan.insuranceCents, loan.method],
    );
    for (const id of [AHORROS, NOMINA, 5])
      await c.query(`INSERT INTO account (product_id, account_type) VALUES ($1, 'savings')`, [id]);
    for (const b of f.balances) {
      await c.query(
        `INSERT INTO account_balance (id, product_id, as_of, balance_cents, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [b.id, b.productId, b.asOf, b.balanceCents, b.createdAt],
      );
    }
    for (const r of f.rates) {
      await c.query(
        `INSERT INTO product_rate (id, product_id, effective_from, ea, mv, source) VALUES ($1, $2, $3, $4, $5, $6)`,
        [r.id, r.productId, r.effectiveFrom, r.ea.toFixed(), r.mv.toFixed(), r.source],
      );
    }
    await c.query(`INSERT INTO category (id, name, kind) VALUES (1, 'Mercado', 'expense')`);
    for (const e of [...f.expenses, MARKET_EXPENSE]) {
      await c.query(
        `INSERT INTO expense (id, date, amount_cents, category_id, description, source_product_id, installments) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [e.id, e.date, e.amountCents, e.categoryId ?? null, e.description, e.sourceProductId, e.installments],
      );
    }
    for (const p of f.capitalPayments) {
      await c.query(
        `INSERT INTO capital_payment (id, product_id, date, amount_cents, mode) VALUES ($1, $2, $3, $4, $5)`,
        [p.id, p.productId, p.date, p.amountCents, p.mode],
      );
    }
    for (const r of f.recurringIncomes) {
      await c.query(
        `INSERT INTO recurring_income (id, name, amount_cents, day_of_month, start_date) VALUES ($1, $2, $3, $4, $5)`,
        [r.id, r.name, r.amountCents, r.dayOfMonth, r.startDate],
      );
    }
    await c.query(
      `INSERT INTO one_off_income (id, date, amount_cents, description, destination_account_id) VALUES ($1, $2, $3, $4, $5)`,
      [SALE.id, SALE.date, SALE.amountCents, SALE.description, SALE.destinationAccountId],
    );
    for (const x of f.fixedExpenses) {
      await c.query(
        `INSERT INTO fixed_expense (id, name, amount_cents, day_of_month, start_date, card_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [x.id, x.name, x.amountCents, x.dayOfMonth, x.startDate, x.cardId],
      );
    }
    await c.query(
      `INSERT INTO statement_check (product_id, cut_date, due_date, statement_minimum_cents, calculated_minimum_cents, within_tolerance) VALUES ($1, '2026-02-15', '2026-03-05', 48000000, 48600000, true)`,
      [VISA],
    );
    await c.query(`UPDATE settings SET yellow_below_income_pct = ${CUSTOM_YELLOW}`);
    // Se sembró con ids explícitos: se adelanta cada secuencia, como la tendría una base que se usó de verdad
    for (const table of [
      'product',
      'account_balance',
      'product_rate',
      'category',
      'expense',
      'capital_payment',
      'one_off_income',
      'recurring_income',
      'fixed_expense',
      'statement_check',
    ]) {
      await c.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`,
      );
    }
  } finally {
    await c.end();
  }
}

async function countAll(db: TestDbSettings): Promise<Record<string, number>> {
  const c = await connect(db);
  try {
    const out: Record<string, number> = {};
    for (const t of ALL_TABLES) {
      const r = await c.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}"`);
      out[t] = r.rows[0]?.n ?? 0;
    }
    return out;
  } finally {
    await c.end();
  }
}

async function hasColumn(db: TestDbSettings, table: string, column: string): Promise<boolean> {
  const c = await connect(db);
  try {
    const r = await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [
      table,
      column,
    ]);
    return r.rowCount === 1;
  } finally {
    await c.end();
  }
}

const OWNER = { OWNER_EMAIL: 'Ana.Owner@Example.COM', OWNER_NAME: 'Ana Dueña' };
let ownerHash: string;
const OWNER_VARS = ['OWNER_EMAIL', 'OWNER_NAME', 'OWNER_PASSWORD_HASH'] as const;

function setOwnerEnv(overrides: Partial<Record<(typeof OWNER_VARS)[number], string | undefined>> = {}): void {
  const values = { ...OWNER, OWNER_PASSWORD_HASH: ownerHash, ...overrides };
  for (const key of OWNER_VARS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

beforeAll(async () => {
  ownerHash = await argon2.hash(OWNER_PASSWORD);
});
afterEach(() => {
  for (const key of OWNER_VARS) delete process.env[key];
});

describe('AddUsers: una base con los datos de hoy', () => {
  let db: TestDbSettings;
  let before: Record<string, number>;
  let ownerId: number;

  beforeAll(async () => {
    db = await legacyDatabase('data');
    await seedLegacy(db);
    before = await countAll(db);
    setOwnerEnv();
    const error = await runAddUsers(db);
    expect(error).toBeUndefined();
    const c = await connect(db);
    try {
      ownerId = (await c.query<{ id: number }>(`SELECT id FROM app_user`)).rows[0]?.id ?? 0;
    } finally {
      await c.end();
    }
  });

  it('el punto de partida tiene filas en todas las tablas (la prueba no es vacía)', () => {
    for (const t of ALL_TABLES) expect(before[t]).toBeGreaterThan(0);
  });

  it('crea exactamente una persona: la dueña, con el email en minúsculas y su nombre', async () => {
    const c = await connect(db);
    try {
      const r = await c.query<{ email: string; name: string; password_hash: string }>(
        `SELECT email, name, password_hash FROM app_user`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ email: 'ana.owner@example.com', name: 'Ana Dueña' });
      // Entra con la contraseña de siempre: el hash que dio es el que quedó guardado
      expect(await argon2.verify(r.rows[0]?.password_hash ?? '', OWNER_PASSWORD)).toBe(true);
    } finally {
      await c.end();
    }
  });

  it.each(OWNED_TABLES)(
    '%s: todas las filas quedaron con el user_id de la dueña, y ninguna se perdió',
    async (table) => {
      const c = await connect(db);
      try {
        const r = await c.query<{ total: number; mine: number }>(
          `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE user_id = $1)::int AS mine FROM "${table}"`,
          [ownerId],
        );
        expect(r.rows[0]?.total).toBe(before[table]);
        expect(r.rows[0]?.mine).toBe(before[table]);
      } finally {
        await c.end();
      }
    },
  );

  it('settings: la misma fila (con el umbral que se había cambiado), ahora con la llave user_id', async () => {
    const c = await connect(db);
    try {
      const r = await c.query<{ user_id: number; y: string; u: string }>(
        `SELECT user_id, yellow_below_income_pct AS y, card_utilization_pct AS u FROM settings`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]?.user_id).toBe(ownerId);
      expect(Number(r.rows[0]?.y)).toBeCloseTo(0.15);
      expect(Number(r.rows[0]?.u)).toBeCloseTo(0.3);
    } finally {
      await c.end();
    }
    expect(await hasColumn(db, 'settings', 'id')).toBe(false);
  });

  it('los ids de las filas no cambiaron (las referencias entre tablas siguen valiendo)', async () => {
    const c = await connect(db);
    try {
      const products = await c.query<{ id: number }>(`SELECT id FROM product ORDER BY id`);
      expect(products.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
      const expense = await c.query<{ source_product_id: number; category_id: number | null }>(
        `SELECT source_product_id, category_id FROM expense WHERE id = 11`,
      );
      expect(expense.rows[0]).toEqual({ source_product_id: AHORROS, category_id: 1 });
    } finally {
      await c.end();
    }
  });

  it('user_id quedó NOT NULL con su llave foránea en las 11 tablas', async () => {
    const c = await connect(db);
    try {
      for (const table of ALL_TABLES) {
        const col = await c.query<{ is_nullable: string }>(
          `SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'user_id'`,
          [table],
        );
        expect({ table, nullable: col.rows[0]?.is_nullable }).toEqual({ table, nullable: 'NO' });
        const fk = await c.query(
          `SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k USING (constraint_name, table_name)
           WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND k.column_name = 'user_id'`,
          [table],
        );
        expect({ table, hasFk: fk.rowCount }).toEqual({ table, hasFk: 1 });
      }
    } finally {
      await c.end();
    }
  });

  it('el mismo banco y últimos 4 ya no chocan entre personas, pero sí dentro de una', async () => {
    const c = await connect(db);
    try {
      const second = await c.query<{ id: number }>(
        `INSERT INTO app_user (email, password_hash, name) VALUES ('otra@example.com', 'x', 'Otra') RETURNING id`,
      );
      const otherId = second.rows[0]?.id;
      await expect(
        c.query(
          `INSERT INTO product (user_id, kind, name, bank, last4) VALUES ($1, 'credit_card', 'Visa', 'Banco Ejemplo', '1111')`,
          [otherId],
        ),
      ).resolves.toBeDefined();
      await expect(
        c.query(
          `INSERT INTO product (user_id, kind, name, bank, last4) VALUES ($1, 'credit_card', 'Visa', 'Banco Ejemplo', '1111')`,
          [otherId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await c.query(`DELETE FROM app_user WHERE id = $1`, [otherId]);
    } finally {
      await c.end();
    }
  });

  it('la proyección de la dueña da exactamente lo mismo que con los datos de antes', async () => {
    const ds = dataSourceFor(db, allFiles());
    await ds.initialize();
    try {
      const loaded = await new ProjectionService(ds).loadFacts(ownerId);
      const expected = facts({
        expenses: [...facts().expenses, MARKET_EXPENSE],
        oneOffIncomes: [SALE],
        settings: make(Settings, { ...facts().settings, yellowBelowIncomePct: new Decimal(CUSTOM_YELLOW) }),
      });
      const after = buildProjection(loaded, 3, TODAY);
      const baseline = buildProjection(expected, 3, TODAY);
      expect(after).toEqual(baseline);
      // Y no es una proyección vacía: hay eventos de verdad
      expect(after.months.some((m) => m.events.length > 0)).toBe(true);
    } finally {
      await ds.destroy();
    }
  });
});

describe('AddUsers: sin saber de quién son los datos, no cambia nada', () => {
  it.each(OWNER_VARS)('falta %s: la migración falla con un mensaje claro y la base queda igual', async (missing) => {
    const db = await legacyDatabase(`sin_${missing.toLowerCase()}`);
    await seedLegacy(db);
    const before = await countAll(db);
    setOwnerEnv({ [missing]: undefined });

    const error = await runAddUsers(db);

    expect(error).toBeDefined();
    expect(error?.message).toContain(missing);
    expect(error?.message).toContain('No se cambió nada');
    // Como estaba: sin tabla de usuarios, sin user_id, settings con su id y los mismos datos
    expect(await countAll(db)).toEqual(before);
    expect(await hasColumn(db, 'product', 'user_id')).toBe(false);
    expect(await hasColumn(db, 'settings', 'id')).toBe(true);
    const c = await connect(db);
    try {
      expect((await c.query<{ t: string | null }>(`SELECT to_regclass('app_user') AS t`)).rows[0]?.t).toBeNull();
      expect((await c.query(`SELECT 1 FROM migrations WHERE name LIKE 'AddUsers%'`)).rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });

  it('un hash que no es argon2id (por ejemplo, a medias por los "$"): falla y no cambia nada', async () => {
    const db = await legacyDatabase('hash_malo');
    await seedLegacy(db);
    const before = await countAll(db);
    setOwnerEnv({ OWNER_PASSWORD_HASH: 'argon2id' });

    const error = await runAddUsers(db);

    expect(error?.message).toMatch(/argon2id/);
    expect(await countAll(db)).toEqual(before);
    expect(await hasColumn(db, 'product', 'user_id')).toBe(false);
  });

  it('con filas en una sola tabla (aunque no sea product) también exige la dueña', async () => {
    const db = await legacyDatabase('una_tabla');
    const c = await connect(db);
    try {
      await c.query(`INSERT INTO category (name, kind) VALUES ('Suelta', 'expense')`);
    } finally {
      await c.end();
    }
    setOwnerEnv({ OWNER_EMAIL: undefined });
    const error = await runAddUsers(db);
    expect(error?.message).toContain('OWNER_EMAIL');
  });
});

describe('AddUsers: una base vacía', () => {
  it('sin OWNER_*: migra sin crear a nadie y deja los ajustes por defecto sin dueño borrados', async () => {
    const db = await legacyDatabase('vacia');
    setOwnerEnv({ OWNER_EMAIL: undefined, OWNER_NAME: undefined, OWNER_PASSWORD_HASH: undefined });

    expect(await runAddUsers(db)).toBeUndefined();

    const counts = await countAll(db);
    expect(counts.settings).toBe(0);
    const c = await connect(db);
    try {
      expect((await c.query(`SELECT 1 FROM app_user`)).rowCount).toBe(0);
    } finally {
      await c.end();
    }
    expect(await hasColumn(db, 'product', 'user_id')).toBe(true);
  });

  it('con OWNER_* puestas tampoco crea a nadie: no hay nada que asignar', async () => {
    const db = await legacyDatabase('vacia_con_env');
    setOwnerEnv();
    expect(await runAddUsers(db)).toBeUndefined();
    const c = await connect(db);
    try {
      expect((await c.query(`SELECT 1 FROM app_user`)).rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });
});

describe('AddUsers: down()', () => {
  it('con una sola persona vuelve al esquema anterior sin perder datos, y se puede volver a subir', async () => {
    const db = await legacyDatabase('down');
    await seedLegacy(db);
    const before = await countAll(db);
    setOwnerEnv();
    expect(await runAddUsers(db)).toBeUndefined();

    const ds = dataSourceFor(db, allFiles());
    await ds.initialize();
    try {
      await ds.undoLastMigration();
    } finally {
      await ds.destroy();
    }

    expect(await countAll(db)).toEqual(before);
    expect(await hasColumn(db, 'product', 'user_id')).toBe(false);
    expect(await hasColumn(db, 'settings', 'id')).toBe(true);
    const c = await connect(db);
    try {
      expect((await c.query<{ t: string | null }>(`SELECT to_regclass('app_user') AS t`)).rows[0]?.t).toBeNull();
      const s = await c.query<{ id: number; y: string }>(`SELECT id, yellow_below_income_pct AS y FROM settings`);
      expect(s.rows).toHaveLength(1);
      expect(s.rows[0]?.id).toBe(1);
      expect(Number(s.rows[0]?.y)).toBeCloseTo(0.15);
    } finally {
      await c.end();
    }

    // Y otra vez hacia adelante
    expect(await runAddUsers(db)).toBeUndefined();
    expect(await hasColumn(db, 'product', 'user_id')).toBe(true);
  });

  it('con dos personas se niega: quitar user_id mezclaría los datos de todas', async () => {
    const db = await legacyDatabase('down_dos');
    await seedLegacy(db);
    setOwnerEnv();
    expect(await runAddUsers(db)).toBeUndefined();
    const c = await connect(db);
    try {
      await c.query(`INSERT INTO app_user (email, password_hash, name) VALUES ('otra@example.com', 'x', 'Otra')`);
    } finally {
      await c.end();
    }

    const ds = dataSourceFor(db, allFiles());
    await ds.initialize();
    let error: Error | undefined;
    try {
      await ds.undoLastMigration();
    } catch (err) {
      error = err as Error;
    } finally {
      await ds.destroy();
    }

    expect(error?.message).toMatch(/No se puede revertir AddUsers con 2 usuarios/);
    expect(await hasColumn(db, 'product', 'user_id')).toBe(true);
  });
});
