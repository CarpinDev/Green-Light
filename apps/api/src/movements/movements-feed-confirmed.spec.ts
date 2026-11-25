import { FixedExpense } from '../incomes/entities/fixed-expense.entity';
import { RecurringIncome } from '../incomes/entities/recurring-income.entity';
import { DebtPayment } from '../payments/entities/debt-payment.entity';
import { RecurringConfirmation } from '../payments/entities/recurring-confirmation.entity';
import { Product } from '../products/entities/product.entity';
import { FakeDb } from '../testing/fake-db';
import { CapitalPayment } from './entities/capital-payment.entity';
import { MovementsFeedService } from './movements-feed.service';

// Lo confirmado en GET /movements: lo programado confirmado sale con su fecha y monto reales (no como calculado) y el
// pago de una tarjeta o préstamo aparece como un movimiento, con su excedente dentro. Datos ficticios.

const VISA = 1;
const AHORROS = 2;
const SALARIO = 30;
const ARRIENDO = 40;
const NETFLIX = 41;
const TODAY = '2026-11-25';

const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);

describe('MovementsFeedService: lo confirmado', () => {
  let db: FakeDb;
  let service: MovementsFeedService;

  beforeEach(() => {
    db = new FakeDb();
    db.seed(Product, [
      { id: VISA, kind: 'credit_card', name: 'Nu', bank: 'Nu', last4: '4174', active: true },
      { id: AHORROS, kind: 'account', name: 'Ahorros', bank: 'B', last4: '1357', active: true },
    ]);
    db.seed(RecurringIncome, [
      {
        id: SALARIO,
        name: 'Salario',
        amountCents: 300_000_000,
        dayOfMonth: 15,
        startDate: '2026-01-01',
        endDate: null,
        destinationAccountId: AHORROS,
      },
    ]);
    db.seed(FixedExpense, [
      {
        id: ARRIENDO,
        name: 'Arriendo',
        amountCents: 100_000_000,
        dayOfMonth: 5,
        startDate: '2026-01-01',
        endDate: null,
        cardId: null,
        accountId: AHORROS,
        categoryId: null,
      },
      {
        id: NETFLIX,
        name: 'Netflix',
        amountCents: 4_000_000,
        dayOfMonth: 20,
        startDate: '2026-01-01',
        endDate: null,
        cardId: VISA,
        accountId: null,
        categoryId: null,
      },
    ]);
    service = new MovementsFeedService(db.dataSource());
  });

  const confirmation = (fields: Partial<RecurringConfirmation>): Partial<RecurringConfirmation> => ({
    id: 1,
    recurringIncomeId: null,
    fixedExpenseId: null,
    accountId: null,
    createdAt: at('2026-11-20', 12),
    ...fields,
  });

  it('lo programado sin confirmar trae la clave para confirmarlo (fecha esperada, id y de qué es)', async () => {
    const items = await service.list(USER_ID, 50, TODAY);
    const salary = items.find((i) => i.id === 'recurring:30:2026-11-15');
    expect(salary).toMatchObject({
      scheduled: true,
      scheduledDate: '2026-11-15',
      refId: SALARIO,
      refKind: 'recurring_income',
      confirmationId: null,
    });
    expect(items.find((i) => i.id === 'fixed:40:2026-11-05')).toMatchObject({
      refId: ARRIENDO,
      refKind: 'fixed_expense',
    });
  });

  it('un gasto fijo con tarjeta no se puede confirmar: no trae refId', async () => {
    const netflix = (await service.list(USER_ID, 50, TODAY)).find((i) => i.id === 'fixed:41:2026-11-20');
    expect(netflix).toMatchObject({ scheduled: true, refId: null, refKind: null });
  });

  it('el salario confirmado sale con su fecha y monto reales, y el calculado desaparece', async () => {
    db.seed(RecurringConfirmation, [
      confirmation({
        recurringIncomeId: SALARIO,
        scheduledDate: '2026-11-15',
        actualDate: '2026-11-13',
        amountCents: 280_000_000,
      }),
    ]);
    const items = (await service.list(USER_ID, 50, TODAY)).filter((i) => i.description === 'Salario');
    const nov = items.filter((i) => i.id === 'recurring:30:2026-11-15');
    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({
      scheduled: false,
      date: '2026-11-13',
      amountCents: 280_000_000,
      direction: 'in',
      confirmationId: 1,
      scheduledDate: null,
    });
  });

  it('un salario que llegó antes de su fecha esperada (aún futura) ya aparece', async () => {
    db.seed(RecurringConfirmation, [
      confirmation({
        recurringIncomeId: SALARIO,
        scheduledDate: '2026-12-15',
        actualDate: '2026-11-24',
        amountCents: 300_000_000,
      }),
    ]);
    const items = await service.list(USER_ID, 50, TODAY);
    expect(items.find((i) => i.date === '2026-11-24')).toMatchObject({ description: 'Salario', confirmationId: 1 });
  });

  it('el arriendo confirmado sale como gasto con lo real', async () => {
    db.seed(RecurringConfirmation, [
      confirmation({
        fixedExpenseId: ARRIENDO,
        scheduledDate: '2026-11-05',
        actualDate: '2026-11-07',
        amountCents: 105_000_000,
      }),
    ]);
    const rent = (await service.list(USER_ID, 50, TODAY)).filter((i) => i.id === 'fixed:40:2026-11-05');
    expect(rent).toHaveLength(1);
    expect(rent[0]).toMatchObject({ scheduled: false, direction: 'out', date: '2026-11-07', amountCents: 105_000_000 });
  });

  it('el pago de la tarjeta sale como movimiento con su origen, y el excedente va dentro (no aparte)', async () => {
    db.seed(DebtPayment, [
      {
        id: 7,
        productId: VISA,
        scheduledDate: '2026-11-18',
        paidDate: '2026-11-25',
        amountCents: 150_000_000,
        sourceAccountId: AHORROS,
        isExternal: false,
        createdAt: at('2026-11-25', 15),
      },
    ]);
    db.seed(CapitalPayment, [
      {
        id: 8,
        productId: VISA,
        date: '2026-11-25',
        amountCents: 50_000_000,
        sourceAccountId: AHORROS,
        isExternal: false,
        expenseId: null,
        debtPaymentId: 7,
        createdAt: at('2026-11-25', 15),
      },
      // Un abono suelto sí sale como abono
      {
        id: 9,
        productId: VISA,
        date: '2026-11-20',
        amountCents: 1_000_000,
        sourceAccountId: null,
        isExternal: true,
        expenseId: null,
        debtPaymentId: null,
        createdAt: at('2026-11-20', 15),
      },
    ]);
    const items = await service.list(USER_ID, 50, TODAY);
    expect(items.find((i) => i.id === 'debt:7')).toMatchObject({
      type: 'debt_payment',
      direction: 'out',
      date: '2026-11-25',
      amountCents: 150_000_000,
      description: 'Pago Nu ••4174',
      sourceLabel: 'desde Ahorros ••1357',
      debtPaymentId: 7,
      product: { id: VISA },
    });
    expect(items.some((i) => i.id === 'capital:8')).toBe(false);
    expect(items.some((i) => i.id === 'capital:9')).toBe(true);
  });

  it('un pago externo dice "externo"', async () => {
    db.seed(DebtPayment, [
      {
        id: 7,
        productId: VISA,
        scheduledDate: '2026-11-18',
        paidDate: '2026-11-25',
        amountCents: 10_000_000,
        sourceAccountId: null,
        isExternal: true,
        createdAt: at('2026-11-25', 15),
      },
    ]);
    expect((await service.list(USER_ID, 50, TODAY)).find((i) => i.id === 'debt:7')?.sourceLabel).toBe('externo');
  });
});

const USER_ID = 1;
