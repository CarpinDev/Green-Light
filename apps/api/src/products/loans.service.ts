import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AmortizationMethod, Cents, IsoDate, PrepaymentMode } from '@greenlight/engine';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { isoDateOf } from '../common/dates';
import { formatCop } from '../common/format-cop';
import { isUniqueViolation } from '../common/pg-errors';
import { CapitalPayment } from '../movements/entities/capital-payment.entity';
import {
  type LoanDetail,
  type LoanFacts,
  type LoanSummary,
  buildLoanDetail,
  buildLoanSummary,
} from './build-loan-view';
import { Loan } from './entities/loan.entity';
import { ProductRate } from './entities/product-rate.entity';
import { Product } from './entities/product.entity';
import { assertLoanProduct, duplicateProductError } from './product-checks';
import { type RateInput, resolveRate } from './resolve-rate';

export interface CreateLoanInput {
  name: string;
  bank: string;
  /** Exactamente 4 dígitos; nunca el número completo. */
  last4: string;
  /** El capital que se debe hoy si el préstamo ya existía (no la deuda total con intereses). */
  principalCents: Cents;
  /** Las cuotas que faltan. */
  termMonths: number;
  /** La fecha de la próxima cuota. */
  firstPaymentDate: IsoDate;
  /** Primera tasa del préstamo: la E.A., la M.V. o las dos. */
  rate: RateInput & { effectiveFrom: IsoDate };
  /** Cuota que informa el banco SIN seguro (capital + interés); debe ser mayor que 0. Si falta, el motor la calcula. */
  fixedPaymentCents?: Cents;
  /**
   * La cuota completa tal como la muestra la app del banco (con el seguro fijo). El servicio la convierte:
   * `fixedPaymentCents = installmentTotalCents − insuranceCents`. No se combina con `fixedPaymentCents` ni con
   * `insuranceRatePct` (con seguro por porcentaje, la cuota del extracto trae el seguro de un saldo anterior).
   */
  installmentTotalCents?: Cents;
  /** Seguro fijo mensual. No se combina con `insuranceRatePct`. */
  insuranceCents?: Cents;
  /** Seguro como porcentaje mensual del saldo, como texto: '0.2344' es 0,2344 % M.V. */
  insuranceRatePct?: string;
  method?: AmortizationMethod;
}

/** Lo que se puede editar. No incluye el capital, las cuotas ni la primera fecha: ver `update`. */
export interface UpdateLoanInput {
  name?: string;
  bank?: string;
  last4?: string;
  /** null: que la calcule el motor. */
  fixedPaymentCents?: Cents | null;
  /** Un seguro fijo (quita el de porcentaje). */
  insuranceCents?: Cents;
  /** Un seguro por porcentaje (quita el fijo); null lo quita sin poner otro. */
  insuranceRatePct?: string | null;
}

@Injectable()
export class LoansService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea el producto, el préstamo y su primera tasa en una sola transacción. */
  async create(userId: number, input: CreateLoanInput): Promise<Product> {
    // Primero lo que se puede validar sin base: si algo está mal, ni se abre la transacción
    const rate = resolveRate({ ea: input.rate.ea, mv: input.rate.mv });
    const insuranceRate = toRate(input.insuranceRatePct);
    const fixedPaymentCents = resolveFixedPayment(input);
    if (insuranceRate !== null && (input.insuranceCents ?? 0) > 0) {
      throw new BadRequestException('El seguro es un monto fijo o un porcentaje del saldo, no los dos');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const product = await manager.save(Product, {
          userId,
          kind: 'loan',
          name: input.name,
          bank: input.bank,
          last4: input.last4,
        });

        await manager.save(Loan, {
          productId: product.id,
          principalCents: input.principalCents,
          termMonths: input.termMonths,
          firstPaymentDate: input.firstPaymentDate,
          ...(fixedPaymentCents !== undefined && { fixedPaymentCents }),
          ...(input.insuranceCents !== undefined && { insuranceCents: input.insuranceCents }),
          ...(insuranceRate !== null && { insuranceRate }),
          ...(input.method !== undefined && { method: input.method }),
        });

        await manager.save(ProductRate, {
          userId,
          productId: product.id,
          effectiveFrom: input.rate.effectiveFrom,
          ea: rate.ea,
          mv: rate.mv,
          source: rate.source,
        });

        return product;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw await duplicateProductError(
          this.dataSource,
          userId,
          'loan',
          input.bank,
          input.last4,
          `Ya existe un préstamo de ${input.bank} terminado en ${input.last4}`,
        );
      }
      throw err;
    }
  }

  /** Los préstamos activos, por nombre, con su saldo, su próxima cuota y cuántas faltan. Todo sale del cronograma. */
  async listActive(userId: number, today: IsoDate = isoDateOf()): Promise<LoanSummary[]> {
    const db = this.dataSource;
    const products = await db.getRepository(Product).find({
      where: { userId, kind: 'loan', active: true },
      order: { name: 'ASC' },
    });
    // Con pocos préstamos basta traer todo y cruzarlo en memoria. loan no tiene user_id (comparte la llave con
    // product): el dueño sale de `products`, ya filtrado, y solo se usan las filas de esos productos.
    const [loans, rates, payments] = await Promise.all([
      db.getRepository(Loan).find(),
      db.getRepository(ProductRate).find({ where: { userId } }),
      db.getRepository(CapitalPayment).find({ where: { userId } }),
    ]);

    return products.flatMap((product) => {
      const loan = loans.find((l) => l.productId === product.id);
      if (!loan) return [];
      return [
        buildLoanSummary(
          {
            product,
            loan,
            rates: rates.filter((r) => r.productId === product.id),
            payments: payments.filter((p) => p.productId === product.id),
          },
          today,
        ),
      ];
    });
  }

  /** Un préstamo con su cronograma completo. 404 si no existe o no es un préstamo. */
  async get(userId: number, id: number, today: IsoDate = isoDateOf()): Promise<LoanDetail> {
    return buildLoanDetail(await this.loadFacts(userId, id), today);
  }

  /**
   * Edita el nombre, el banco, los últimos 4, la cuota del banco y el seguro. NO el capital, las cuotas ni la
   * primera fecha: el cronograma de un préstamo se calcula desde esos tres datos, y cambiarlos reescribe la historia
   * de los abonos ya hechos (un abono de reducir plazo apunta a "la cuota N" de ese cronograma). Para corregir uno de
   * esos tres, se elimina el préstamo y se crea de nuevo. La tasa se cambia con `POST /products/:id/rates`.
   */
  async update(userId: number, id: number, input: UpdateLoanInput): Promise<{ id: number }> {
    const hasRate = input.insuranceRatePct !== undefined;
    const hasFixed = input.insuranceCents !== undefined;
    if (hasRate && input.insuranceRatePct !== null && hasFixed && (input.insuranceCents ?? 0) > 0) {
      throw new BadRequestException('El seguro es un monto fijo o un porcentaje del saldo, no los dos');
    }
    const fraction = toRate(input.insuranceRatePct);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const product = await manager.findOneBy(Product, { id, userId });
        const loan = await manager.findOneBy(Loan, { productId: id });
        assertLoanProduct(product, id);
        if (!product || !loan) throw new NotFoundException(`El préstamo ${id} no existe`);

        if (input.name !== undefined || input.bank !== undefined || input.last4 !== undefined) {
          await manager.save(Product, {
            ...product,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.bank !== undefined && { bank: input.bank }),
            ...(input.last4 !== undefined && { last4: input.last4 }),
          });
        }

        const changes: Partial<Loan> = {};
        if (input.fixedPaymentCents !== undefined) changes.fixedPaymentCents = input.fixedPaymentCents;
        // Cambiar de un tipo de seguro al otro: el nuevo manda y el anterior se limpia
        if (fraction !== null) {
          changes.insuranceRate = fraction;
          changes.insuranceCents = 0;
        } else if (hasFixed) {
          changes.insuranceCents = input.insuranceCents ?? 0;
          changes.insuranceRate = null;
        } else if (hasRate) {
          changes.insuranceRate = null; // null explícito: sin seguro por porcentaje
        }
        if (Object.keys(changes).length > 0) await manager.save(Loan, { ...loan, ...changes });
        return { id };
      });
    } catch (err) {
      if (isUniqueViolation(err) && input.bank !== undefined && input.last4 !== undefined) {
        throw await duplicateProductError(
          this.dataSource,
          userId,
          'loan',
          input.bank,
          input.last4,
          `Ya existe un préstamo de ${input.bank} terminado en ${input.last4}`,
        );
      }
      if (isUniqueViolation(err)) throw new BadRequestException('Ya existe un préstamo con ese banco y esos últimos 4');
      throw err;
    }
  }

  /**
   * Vista previa de un abono: cómo quedaría el préstamo (cuota, cuotas restantes y fecha de fin) con y sin él, sin
   * guardar nada. Usa el mismo cronograma del motor que todo lo demás, así lo que se promete es lo que pasa. Pasar
   * del saldo es 400, igual que al registrar el abono.
   */
  async previewPrepayment(
    userId: number,
    id: number,
    input: { date: IsoDate; amountCents: Cents; mode: PrepaymentMode },
    today: IsoDate = isoDateOf(),
  ): Promise<LoanPrepaymentPreview> {
    const facts = await this.loadFacts(userId, id);
    const before = buildLoanSummary(facts, today);

    const owed = buildLoanSummary(facts, input.date).balanceCents;
    if (input.amountCents > owed) {
      throw new BadRequestException(
        owed === 0
          ? 'No hay deuda para abonar en esa fecha.'
          : `Solo puedes abonar hasta ${formatCop(owed)}: es lo que debes del préstamo.`,
      );
    }

    // Un abono hipotético: no se guarda, solo se suma a los que ya hay para recalcular el cronograma
    const hypothetical = Object.assign(new CapitalPayment(), {
      id: 0,
      userId,
      productId: id,
      date: input.date,
      amountCents: input.amountCents,
      mode: input.mode,
      expenseId: null,
      sourceAccountId: null,
      isExternal: false,
    });
    const after = buildLoanSummary({ ...facts, payments: [...facts.payments, hypothetical] }, today);
    return { before: pick(before), after: pick(after) };
  }

  private async loadFacts(userId: number, id: number): Promise<LoanFacts> {
    const db = this.dataSource;
    // El préstamo de otra persona es "no existe": 404
    const product = await db.getRepository(Product).findOneBy({ id, userId });
    assertLoanProduct(product, id);
    const loan = await db.getRepository(Loan).findOneBy({ productId: id });
    if (!product || !loan) throw new NotFoundException(`El préstamo ${id} no existe`);

    const [rates, payments] = await Promise.all([
      db.getRepository(ProductRate).find({ where: { userId, productId: id } }),
      db.getRepository(CapitalPayment).find({ where: { userId, productId: id } }),
    ]);
    return { product, loan, rates, payments };
  }
}

/** Lo que cambia con un abono. */
export interface LoanPrepaymentEffect {
  installmentCents: Cents;
  remainingInstallments: number;
  endDate: IsoDate | null;
  balanceCents: Cents;
}

export interface LoanPrepaymentPreview {
  before: LoanPrepaymentEffect;
  after: LoanPrepaymentEffect;
}

function pick(s: LoanSummary): LoanPrepaymentEffect {
  return {
    installmentCents: s.installmentCents,
    remainingInstallments: s.remainingInstallments,
    endDate: s.endDate,
    balanceCents: s.balanceCents,
  };
}

/**
 * La cuota sin seguro que se guarda. La app manda lo que ve el usuario (la cuota total del extracto) y la API hace
 * la resta: así la regla "cuota total − seguro" vive en un solo lugar y no se repite (ni se desfasa) en cada cliente.
 */
function resolveFixedPayment(input: CreateLoanInput): Cents | undefined {
  if (input.installmentTotalCents === undefined) return input.fixedPaymentCents;

  if (input.fixedPaymentCents !== undefined) {
    throw new BadRequestException('Manda la cuota total o la cuota sin seguro, no las dos');
  }
  if (input.insuranceRatePct !== undefined) {
    throw new BadRequestException(
      'Con seguro por porcentaje manda la cuota sin seguro (capital + interés): la cuota total del extracto trae el seguro de un saldo anterior',
    );
  }
  const fixed = input.installmentTotalCents - (input.insuranceCents ?? 0);
  if (fixed <= 0) {
    throw new BadRequestException(
      'La cuota total debe ser mayor que el seguro: la cuota sin seguro quedaría en 0 o menos',
    );
  }
  return fixed;
}

/** '0.2344' (porcentaje) -> fracción 0.002344, con los 6 decimales de la columna. 400 si no es un porcentaje válido. */
function toFraction(pct: string): Decimal {
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(pct)) {
    throw new BadRequestException('El seguro por porcentaje debe ser como 0.2344 (hasta 4 decimales, menor que 100)');
  }
  return new Decimal(pct).div(100);
}

/** Como toFraction, pero 0 % es "sin seguro por porcentaje": null. */
function toRate(pct: string | null | undefined): Decimal | null {
  if (pct === null || pct === undefined) return null;
  const fraction = toFraction(pct);
  return fraction.isZero() ? null : fraction;
}
