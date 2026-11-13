import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { Expense } from '../movements/entities/expense.entity';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { CreditCard } from '../products/entities/credit-card.entity';
import { Loan } from '../products/entities/loan.entity';
import { ProductRate } from '../products/entities/product-rate.entity';
import { Product } from '../products/entities/product.entity';
import { Settings } from '../settings/entities/settings.entity';
import { FakeDb } from '../testing/fake-db';
import { make, rateRow } from '../testing/projection-facts';
import { OTHER_USER, USER } from '../testing/users';
import { ProjectionService } from './projection.service';

// Qué filas entran a la proyección de cada persona. credit_card y loan NO tienen user_id (comparten la llave con
// product): si loadFacts no las cruzara con los productos del usuario, la tarjeta y el préstamo de otra persona
// entrarían a su proyección. Con FakeDb, sin Postgres.

const MY_CARD = 1;
const MY_LOAN = 2;
const MY_ACCOUNT = 3;
const THEIR_CARD = 11;
const THEIR_LOAN = 12;
const THEIR_ACCOUNT = 13;

describe('ProjectionService.loadFacts', () => {
  let db: FakeDb;
  let service: ProjectionService;

  beforeEach(() => {
    db = new FakeDb();
    db.keyBy.set(Settings, 'userId');
    db.withoutId.add(CreditCard);
    db.withoutId.add(Loan);

    const product = (id: number, userId: number, kind: 'credit_card' | 'loan' | 'account', active = true) => ({
      id,
      userId,
      kind,
      name: `p${id}`,
      bank: 'Banco Ejemplo',
      last4: String(1000 + id),
      active,
    });
    db.seed(Product, [
      product(MY_CARD, USER, 'credit_card'),
      product(MY_LOAN, USER, 'loan'),
      product(MY_ACCOUNT, USER, 'account'),
      product(THEIR_CARD, OTHER_USER, 'credit_card'),
      product(THEIR_LOAN, OTHER_USER, 'loan'),
      product(THEIR_ACCOUNT, OTHER_USER, 'account'),
    ]);
    db.seed(CreditCard, [make(CreditCard, { productId: MY_CARD }), make(CreditCard, { productId: THEIR_CARD })]);
    db.seed(Loan, [make(Loan, { productId: MY_LOAN }), make(Loan, { productId: THEIR_LOAN })]);
    db.seed(AccountBalance, [
      make(AccountBalance, { id: 1, productId: MY_ACCOUNT, userId: USER }),
      make(AccountBalance, { id: 2, productId: THEIR_ACCOUNT, userId: OTHER_USER }),
    ]);
    db.seed(ProductRate, [
      { ...rateRow(1, MY_CARD, '2026-01-01', '0.02'), userId: USER },
      { ...rateRow(2, THEIR_CARD, '2026-01-01', '0.03'), userId: OTHER_USER },
    ]);
    db.seed(Expense, [
      make(Expense, { id: 1, sourceProductId: MY_CARD, userId: USER }),
      make(Expense, { id: 2, sourceProductId: THEIR_CARD, userId: OTHER_USER }),
    ]);
    db.seed(CapitalPayment, [
      make(CapitalPayment, { id: 1, productId: MY_LOAN, userId: USER }),
      make(CapitalPayment, { id: 2, productId: THEIR_LOAN, userId: OTHER_USER }),
    ]);
    db.seed(RecurringIncome, [
      make(RecurringIncome, { id: 1, name: 'mío', userId: USER }),
      make(RecurringIncome, { id: 2, name: 'suyo', userId: OTHER_USER }),
    ]);
    db.seed(FixedExpense, [
      make(FixedExpense, { id: 1, name: 'mío', userId: USER }),
      make(FixedExpense, { id: 2, name: 'suyo', userId: OTHER_USER }),
    ]);
    db.seed(Settings, [make(Settings, { userId: USER }), make(Settings, { userId: OTHER_USER })]);
    service = new ProjectionService(db.dataSource());
  });

  it('solo trae la tarjeta, el préstamo y el saldo del usuario', async () => {
    const facts = await service.loadFacts(USER);
    expect(facts.cards.map((c) => c.productId)).toEqual([MY_CARD]);
    expect(facts.loans.map((l) => l.productId)).toEqual([MY_LOAN]);
    expect(facts.balances.map((b) => b.productId)).toEqual([MY_ACCOUNT]);
  });

  it('y lo mismo, en espejo, para la otra persona', async () => {
    const facts = await service.loadFacts(OTHER_USER);
    expect(facts.cards.map((c) => c.productId)).toEqual([THEIR_CARD]);
    expect(facts.loans.map((l) => l.productId)).toEqual([THEIR_LOAN]);
    expect(facts.balances.map((b) => b.productId)).toEqual([THEIR_ACCOUNT]);
  });

  it('tasas, gastos, abonos, ingresos y gastos fijos son solo los suyos', async () => {
    const facts = await service.loadFacts(USER);
    expect(facts.rates.map((r) => r.productId)).toEqual([MY_CARD]);
    expect(facts.expenses.map((e) => e.sourceProductId)).toEqual([MY_CARD]);
    expect(facts.capitalPayments.map((p) => p.productId)).toEqual([MY_LOAN]);
    expect(facts.recurringIncomes.map((r) => r.name)).toEqual(['mío']);
    expect(facts.fixedExpenses.map((f) => f.name)).toEqual(['mío']);
  });

  it('usa los ajustes del usuario', async () => {
    const mine = db.rows(Settings).find((s) => s.userId === USER);
    if (mine) mine.yellowBelowIncomePct = make(Settings, {}).yellowBelowIncomePct;
    const facts = await service.loadFacts(USER);
    expect(facts.settings.userId).toBe(USER);
  });

  it('sin fila de ajustes falla (un usuario siempre nace con la suya)', async () => {
    await expect(service.loadFacts(999)).rejects.toThrow();
  });

  it('un producto archivado del usuario sigue sin contar, y el de otra persona no lo afecta', async () => {
    const mine = db.rows(Product).find((p) => p.id === MY_CARD);
    if (mine) mine.active = false;
    const facts = await service.loadFacts(USER);
    expect(facts.cards).toHaveLength(0);
    // La tarjeta de la otra persona sigue activa para ella
    expect((await service.loadFacts(OTHER_USER)).cards).toHaveLength(1);
  });
});
