import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * De dónde sale el dinero de un abono a capital: de una cuenta (`source_account_id`) o de afuera (`is_external`,
 * plata que no pasa por las cuentas). Una cosa o la otra, de ahí el CHECK; los dos pueden faltar (los abonos de
 * antes, que la proyección sigue descontando del disponible como siempre).
 *
 * RESTRICT, igual que en el resto: con SET NULL el abono cambiaría de origen sin avisar.
 * Por ahora solo se guarda: el saldo por cuenta lo usará en otra rama.
 */
export class CapitalPaymentSource1794600000000 implements MigrationInterface {
  name = 'CapitalPaymentSource1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "capital_payment" ADD "source_account_id" integer`);
    await queryRunner.query(`ALTER TABLE "capital_payment" ADD "is_external" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `ALTER TABLE "capital_payment" ADD CONSTRAINT "CHK_ba009f85fa7bfff96da589e6c8" CHECK (NOT ("is_external" AND "source_account_id" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "capital_payment" ADD CONSTRAINT "FK_c1d79aaa6cb5039820a61856a12" FOREIGN KEY ("source_account_id") REFERENCES "account"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP CONSTRAINT "FK_c1d79aaa6cb5039820a61856a12"`);
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP CONSTRAINT "CHK_ba009f85fa7bfff96da589e6c8"`);
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP COLUMN "is_external"`);
    await queryRunner.query(`ALTER TABLE "capital_payment" DROP COLUMN "source_account_id"`);
  }
}
