import { FixedExpense as FixedExpenseRow } from '../incomes/entities/fixed-expense.entity';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { DebtPayment } from '../payments/entities/debt-payment.entity';
import { RecurringConfirmation } from '../payments/entities/recurring-confirmation.entity';
import { PRESTAMO, VISA, at, facts, make, pesos } from '../testing/projection-facts';
import { type ProjectionFacts, buildProjection } from './build-projection';

// El caso real: la tarjeta cortó el 15 de marzo y vence el 5 de abril, pero se pagó el 25 de marzo. Sin confirmar, la
// proyección descuenta el mínimo el 5 de abril; confirmado, lo descuenta el 25 de marzo y abril ya no lo cuenta. Es el
// mismo caso de la tarjeta Nu (corte 18-nov, pago 25-nov, límite 4-dic) con las fechas de los datos de prueba:
// el saldo es del 10 de marzo y "hoy" es el 25.

const TODAY = '2026-03-25';
const CUT = '2026-03-15';
const run = (f: ProjectionFacts) => buildProjection(f, 3, TODAY);
const eventsOf = (f: ProjectionFacts) => run(f).months.flatMap((m) => m.events);

// El mínimo de ese corte, tal como lo calcula la proyección sin confirmar
const supposed = eventsOf(facts()).find((e) => e.kind === 'card_payment' && e.scheduledDate === CUT);
const MINIMUM = -(supposed?.amount ?? 0);

const payment = (fields: Partial<DebtPayment> = {}) =>
  make(DebtPayment, {
    id: 50,
    userId: 1,
    productId: VISA,
    scheduledDate: CUT,
    paidDate: '2026-03-25',
    amountCents: MINIMUM,
    sourceAccountId: null,
    isExternal: false,
    createdAt: at('2026-03-25', 15),
    ...fields,
  });
const confirmed = (fields?: Partial<DebtPayment>, extra: Partial<ProjectionFacts> = {}) =>
  facts({ debtPayments: [payment(fields)], ...extra });

describe('buildProjection: pago de tarjeta confirmado', () => {
  it('sin confirmar, el mínimo sale el día del vencimiento (5 de abril)', () => {
    expect(supposed).toMatchObject({ date: '2026-04-05', cutDate: CUT });
    expect(MINIMUM).toBeGreaterThan(0);
  });

  it('confirmado el 25 de marzo: sale ese día con el monto real y ya no el 5 de abril', () => {
    const events = eventsOf(confirmed()).filter((e) => e.kind === 'card_payment');
    expect(events.find((e) => e.scheduledDate === CUT)).toMatchObject({
      date: '2026-03-25',
      amount: -MINIMUM,
      confirmed: true,
    });
    expect(events.some((e) => e.date === '2026-04-05' && e.cutDate === CUT)).toBe(false);
  });

  it('el saldo actual baja desde el 25 de marzo, y abril ya no descuenta el pago', () => {
    const before = run(facts());
    const after = run(confirmed());
    expect(after.currentBalanceCents).toBe(before.currentBalanceCents - MINIMUM);

    const [mar, apr] = after.months;
    const [marBefore, aprBefore] = before.months;
    expect(mar?.outflow).toBe((marBefore?.outflow ?? 0) + MINIMUM);
    expect(apr?.outflow).toBe((aprBefore?.outflow ?? 0) - MINIMUM);
    // La caja total del trimestre no cambia: el pago solo se movió de mes
    expect(after.months.at(-1)?.closingBalance).toBe(before.months.at(-1)?.closingBalance);
  });

  it('confirmado antes del saldo: ya está en el saldo y tampoco sale el supuesto', () => {
    const events = eventsOf(confirmed({ paidDate: '2026-03-08' })).filter((e) => e.cutDate === CUT);
    expect(events).toEqual([]);
  });

  it('con excedente: el pago suma lo pagado (mínimo + abono) sin contarlo dos veces', () => {
    const extra = pesos(100_000);
    const abono = make(CapitalPayment, {
      id: 60,
      userId: 1,
      productId: VISA,
      date: '2026-03-25',
      amountCents: extra,
      mode: 'reduce_term',
      expenseId: null,
      sourceAccountId: null,
      isExternal: false,
      debtPaymentId: 50,
    });
    const base = facts();
    const withExcess = facts({
      debtPayments: [payment({ amountCents: MINIMUM + extra })],
      capitalPayments: [...base.capitalPayments, abono],
    });

    const before = run(base);
    const after = run(withExcess);
    // Al motor le llega el mínimo como pago y el excedente como abono: la caja baja exactamente lo pagado
    expect(after.currentBalanceCents).toBe(before.currentBalanceCents - MINIMUM - extra);
    const onThe25th = after.months.flatMap((m) => m.events).filter((e) => e.date === '2026-03-25');
    expect(onThe25th.some((e) => e.kind === 'card_payment' && e.amount === -MINIMUM)).toBe(true);
    // Los abonos del mismo día se agrupan: el que ya había (200.000) y el excedente de este pago
    const abonos = onThe25th.filter((e) => e.kind === 'capital_payment').reduce((sum, e) => sum + e.amount, 0);
    expect(abonos).toBe(-(pesos(200_000) + extra));
  });

  it('con faltante: el pago real el 25 y lo que faltó en la siguiente fecha límite', () => {
    const short = pesos(50_000);
    const events = eventsOf(confirmed({ amountCents: MINIMUM - short })).filter((e) => e.kind === 'card_payment');
    expect(events.find((e) => e.scheduledDate === CUT)).toMatchObject({
      date: '2026-03-25',
      amount: -(MINIMUM - short),
    });
    expect(events.find((e) => e.label === `Pendiente del corte ${CUT}`)).toMatchObject({
      date: '2026-05-05',
      amount: -short,
    });
  });

  it('externo: baja la deuda pero no sale ninguna caja, ni el 25 ni el 5 de abril', () => {
    const events = eventsOf(confirmed({ isExternal: true })).filter((e) => e.cutDate === CUT);
    expect(events).toEqual([]);
    expect(run(confirmed({ isExternal: true })).currentBalanceCents).toBe(run(facts()).currentBalanceCents);
  });

  it('del mismo día del saldo solo cuenta si se registró después de confirmarlo', () => {
    // El saldo se confirmó el 10 de marzo a las 14:00 UTC
    const early = eventsOf(confirmed({ paidDate: '2026-03-10', createdAt: at('2026-03-10', 9) }));
    expect(early.some((e) => e.cutDate === CUT)).toBe(false);
    const late = eventsOf(confirmed({ paidDate: '2026-03-10', createdAt: at('2026-03-10', 20) }));
    expect(late.find((e) => e.cutDate === CUT)).toMatchObject({ date: '2026-03-10', confirmed: true });
  });

  it('un pago confirmado de un préstamo reemplaza la cuota supuesta', () => {
    const due = eventsOf(facts()).find((e) => e.kind === 'loan_payment' && e.date === '2026-03-10');
    // Con el saldo del 10 de marzo esa cuota ya está dentro; la del 10 de abril sí es futura
    const april = eventsOf(facts()).find((e) => e.kind === 'loan_payment' && e.scheduledDate === '2026-04-10');
    expect(due).toBeUndefined();
    const amount = -(april?.amount ?? 0);

    const paid = eventsOf(
      facts({
        debtPayments: [
          make(DebtPayment, {
            id: 51,
            userId: 1,
            productId: PRESTAMO,
            scheduledDate: '2026-04-10',
            paidDate: '2026-04-07',
            amountCents: amount,
            sourceAccountId: null,
            isExternal: false,
            createdAt: at('2026-03-20', 10),
          }),
        ],
      }),
    ).filter((e) => e.kind === 'loan_payment');
    expect(paid.find((e) => e.scheduledDate === '2026-04-10')).toMatchObject({
      date: '2026-04-07',
      amount: -amount,
      confirmed: true,
    });
    expect(paid.some((e) => e.date === '2026-04-10')).toBe(false);
  });
});

describe('buildProjection: ingresos y gastos fijos confirmados', () => {
  const salary = (fields: Partial<RecurringConfirmation> = {}) =>
    make(RecurringConfirmation, {
      id: 70,
      userId: 1,
      recurringIncomeId: 30,
      fixedExpenseId: null,
      scheduledDate: '2026-03-30',
      actualDate: '2026-03-24',
      amountCents: pesos(2_800_000),
      accountId: null,
      createdAt: at('2026-03-24', 18),
      ...fields,
    });

  it('el salario del 30 que llegó el 24 con otro monto sale ese día y el saldo actual lo cuenta', () => {
    const f = facts({ recurringConfirmations: [salary()] });
    const events = eventsOf(f).filter((e) => e.kind === 'income');
    expect(events.find((e) => e.scheduledDate === '2026-03-30')).toMatchObject({
      date: '2026-03-24',
      amount: pesos(2_800_000),
      confirmed: true,
    });
    expect(events.some((e) => e.date === '2026-03-30')).toBe(false);
    expect(run(f).currentBalanceCents).toBe(run(facts()).currentBalanceCents + pesos(2_800_000));
  });

  it('el ingreso de referencia del mes usa el monto real', () => {
    const march = run(facts({ recurringConfirmations: [salary()] })).months[0];
    expect(march?.referenceIncome).toBe(pesos(2_800_000));
  });

  it('un gasto fijo (arriendo) confirmado con otro monto', () => {
    const f = facts();
    const rent = make(FixedExpenseRow, {
      id: 41,
      name: 'Arriendo',
      amountCents: pesos(1_000_000),
      dayOfMonth: 20,
      startDate: '2026-01-01',
      endDate: null,
      cardId: null,
      accountId: null,
    });
    const withRent = { ...f, fixedExpenses: [...f.fixedExpenses, rent] };
    const base = eventsOf(withRent).find((e) => e.kind === 'fixed_expense' && e.scheduledDate === '2026-04-20');
    expect(base).toMatchObject({ date: '2026-04-20', amount: -pesos(1_000_000) });

    const done = make(RecurringConfirmation, {
      id: 71,
      userId: 1,
      recurringIncomeId: null,
      fixedExpenseId: 41,
      scheduledDate: '2026-03-20',
      actualDate: '2026-03-22',
      amountCents: pesos(1_050_000),
      accountId: null,
      createdAt: at('2026-03-22', 10),
    });
    const march = eventsOf({ ...withRent, recurringConfirmations: [done] }).find(
      (e) => e.kind === 'fixed_expense' && e.scheduledDate === '2026-03-20',
    );
    expect(march).toMatchObject({ date: '2026-03-22', amount: -pesos(1_050_000), confirmed: true });
  });
});
