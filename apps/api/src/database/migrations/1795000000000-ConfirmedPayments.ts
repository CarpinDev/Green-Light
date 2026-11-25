import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Confirmar lo que de verdad pasó en vez de lo que la proyección suponía. Todo es aditivo (dos tablas nuevas y una
 * columna opcional): el código anterior sigue funcionando con esta migración ya corrida, por eso se migra primero
 * y se despliega después.
 *
 * Dos tablas y no una polimórfica: un pago de deuda lleva origen del dinero y excedente (que es un abono a capital),
 * y una llegada de salario o pago de un gasto fijo solo lleva una cuenta. Una tabla con todo sería llena de columnas
 * que valen null según el caso y de CHECKs para sostenerlas; dos tablas dejan que cada una exprese sus propias reglas.
 *
 * - `debt_payment`: un pago de tarjeta o préstamo. `scheduled_date` (el corte o la fecha de la cuota) es su clave y
 *   es única por producto: un pago esperado se confirma una sola vez. `amount_cents` es todo lo pagado.
 * - `capital_payment.debt_payment_id`: el excedente sobre el mínimo es un abono a capital ligado al pago. CASCADE:
 *   borrar el pago borra su excedente, para que no quede un abono huérfano bajando una deuda que ya no se pagó.
 * - `recurring_confirmation`: una ocurrencia de un ingreso o gasto fijo, de uno u otro (`num_nonnulls = 1`), con un
 *   UNIQUE parcial por cada uno (un UNIQUE normal no sirve: los null nunca chocan entre sí).
 *
 * RESTRICT en las cuentas, igual que en capital_payment: con SET NULL el pago cambiaría de origen sin avisar.
 * Los nombres de índices y constraints son los que TypeORM calcula, para que el esquema coincida con las entidades.
 */
export class ConfirmedPayments1795000000000 implements MigrationInterface {
  name = 'ConfirmedPayments1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "debt_payment" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "product_id" integer NOT NULL, "scheduled_date" date NOT NULL, "paid_date" date NOT NULL, "amount_cents" bigint NOT NULL, "source_account_id" integer, "is_external" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_f2213c1be8978e00b7bb3e22c0" CHECK ("amount_cents" > 0), CONSTRAINT "CHK_95202dc95a09fce990fb01c5f0" CHECK (NOT ("is_external" AND "source_account_id" IS NOT NULL)), CONSTRAINT "PK_19caadb2d938d9ccf647a8478d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_75b5be2c540b8d5fce2a5f89d0" ON "debt_payment" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_82242b462123cbd506d30fafa2" ON "debt_payment" ("product_id", "scheduled_date") `,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payment" ADD CONSTRAINT "FK_75b5be2c540b8d5fce2a5f89d0c" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payment" ADD CONSTRAINT "FK_9cb66f2981a43395e65aaa74677" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payment" ADD CONSTRAINT "FK_741b0bcabf0217bf7a7c5a7c7b0" FOREIGN KEY ("source_account_id") REFERENCES "account"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "capital_payment" ADD "debt_payment_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "capital_payment" ADD CONSTRAINT "FK_cca61a646af76ec736a260af53a" FOREIGN KEY ("debt_payment_id") REFERENCES "debt_payment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "recurring_confirmation" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "recurring_income_id" integer, "fixed_expense_id" integer, "scheduled_date" date NOT NULL, "actual_date" date NOT NULL, "amount_cents" bigint NOT NULL, "account_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_622f2376fff6aa9d198ba52a10" CHECK (num_nonnulls("recurring_income_id", "fixed_expense_id") = 1), CONSTRAINT "CHK_b6bf87bca0cc0f062894997fc0" CHECK ("amount_cents" > 0), CONSTRAINT "PK_25e26a10b2c60f8b9a35f6711ec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a7a0f85b690aa71324df1f5cd1" ON "recurring_confirmation" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_00a2c52ff6d364640d44de56e2" ON "recurring_confirmation" ("recurring_income_id", "scheduled_date") WHERE "recurring_income_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_23daf03f4551a5ef0e54682ba9" ON "recurring_confirmation" ("fixed_expense_id", "scheduled_date") WHERE "fixed_expense_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_confirmation" ADD CONSTRAINT "FK_a7a0f85b690aa71324df1f5cd1a" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_confirmation" ADD CONSTRAINT "FK_ee04d639e5e3a9fa2472c90737f" FOREIGN KEY ("recurring_income_id") REFERENCES "recurring_income"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_confirmation" ADD CONSTRAINT "FK_76294e1b856e8b7e2fc419dc602" FOREIGN KEY ("fixed_expense_id") REFERENCES "fixed_expense"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_confirmation" ADD CONSTRAINT "FK_913adc82a824d10ea469b32b5eb" FOREIGN KEY ("account_id") REFERENCES "account"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al revés: primero lo que apunta a otras tablas. recurring_confirmation y la FK de capital_payment antes que debt_payment
    await queryRunner.query(`DROP TABLE "recurring_confirmation"`);
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP CONSTRAINT "FK_cca61a646af76ec736a260af53a"`);
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP COLUMN "debt_payment_id"`);
    await queryRunner.query(`DROP TABLE "debt_payment"`);
  }
}
