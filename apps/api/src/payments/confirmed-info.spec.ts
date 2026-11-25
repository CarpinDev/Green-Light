import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import { make } from '../testing/projection-facts';
import { confirmedInfoOf } from './confirmed-info';
import { DebtPayment } from './entities/debt-payment.entity';

// Lo que la app necesita para mostrar "Pagado el 25 nov" y ofrecer deshacerlo. Datos ficticios.

const payment = make(DebtPayment, {
  id: 7,
  scheduledDate: '2026-11-18',
  paidDate: '2026-11-25',
  amountCents: 150_000_000,
});
const excess = make(CapitalPayment, { id: 8, amountCents: 50_000_000, debtPaymentId: 7 });
const other = make(CapitalPayment, { id: 9, amountCents: 1_000_000, debtPaymentId: null });

describe('confirmedInfoOf', () => {
  it('encuentra el pago de ese corte y separa el excedente ligado', () => {
    expect(confirmedInfoOf([payment], [excess, other], '2026-11-18')).toEqual({
      id: 7,
      paidDate: '2026-11-25',
      amountCents: 150_000_000,
      excessCents: 50_000_000,
    });
  });

  it('sin pago para esa fecha, o sin lista, es null', () => {
    expect(confirmedInfoOf([payment], [], '2026-12-18')).toBeNull();
    expect(confirmedInfoOf(undefined, [], '2026-11-18')).toBeNull();
  });
});
