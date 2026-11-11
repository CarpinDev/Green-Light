import { type ProjectionFacts } from './build-projection';
import { isoDateOf } from '../common/dates';
import { AccountBalance } from '../products/entities/account-balance.entity';
import { VISA, facts, make, pesos } from '../testing/projection-facts';
import { type ProjectionService } from './projection.service';
import { SimulationsService } from './simulations.service';

// El service solo pone la fecha de hoy y los valores por defecto: las reglas están en buildSimulation.
// Las filas salen de un ProjectionService falso. El saldo es de hoy para que no venza (409).

const fresh = (): ProjectionFacts =>
  facts({
    balances: [make(AccountBalance, { id: 1, productId: 3, asOf: isoDateOf(), balanceCents: pesos(2_000_000) })],
  });

const serviceWith = (f: ProjectionFacts) =>
  new SimulationsService({ loadFacts: () => Promise.resolve(f) } as unknown as ProjectionService);

const tv = { cardId: VISA, amountCents: pesos(1_200_000), installments: 3 };

describe('SimulationsService', () => {
  it('sin fecha la compra es de hoy, y sin meses se proyectan 6', async () => {
    const result = await serviceWith(fresh()).simulate(tv);
    expect(result.asOf).toBe(isoDateOf());
    expect(result.daysSinceBalance).toBe(0);
    expect(result.with).toHaveLength(6);
    expect(result.options.map((o) => o.installments)).toEqual([1, 3, 6, 12]);
  });

  it('respeta los meses que pide el cliente', async () => {
    expect((await serviceWith(fresh()).simulate({ ...tv, months: 2 })).with).toHaveLength(2);
  });

  it('un saldo viejo es 409, igual que la proyección', async () => {
    await expect(serviceWith(facts()).simulate(tv)).rejects.toThrow(/confírmalo/);
  });
});
