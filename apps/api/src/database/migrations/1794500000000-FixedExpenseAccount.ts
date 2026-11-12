import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La cuenta de la que sale un gasto fijo (opcional). Es información de origen: la proyección trabaja con un solo
 * disponible, así que no cambia ninguna cifra.
 *
 * RESTRICT y no SET NULL, igual que `card_id`: con SET NULL el gasto cambiaría de origen sin avisar. Y un gasto sale
 * de una sola cosa, de ahí el CHECK. Las filas que ya existen quedan con `account_id` en NULL, así que lo cumplen.
 */
export class FixedExpenseAccount1794500000000 implements MigrationInterface {
  name = 'FixedExpenseAccount1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fixed_expense" ADD "account_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "fixed_expense" ADD CONSTRAINT "CHK_b4dcbea930451806629dcbf84e" CHECK ("card_id" IS NULL OR "account_id" IS NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fixed_expense" ADD CONSTRAINT "FK_07ca7847e1b82139368314ade5c" FOREIGN KEY ("account_id") REFERENCES "account"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fixed_expense" DROP CONSTRAINT "FK_07ca7847e1b82139368314ade5c"`);
    await queryRunner.query(`ALTER TABLE "fixed_expense" DROP CONSTRAINT "CHK_b4dcbea930451806629dcbf84e"`);
    await queryRunner.query(`ALTER TABLE "fixed_expense" DROP COLUMN "account_id"`);
  }
}
