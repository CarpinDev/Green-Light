import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El seguro de un préstamo como porcentaje mensual del saldo (el de Rappi baja cada mes porque el saldo baja).
 * `insurance_rate` es una fracción: 0,2344 % se guarda como 0.002344. O un seguro fijo (`insurance_cents`) o uno
 * por tasa, nunca los dos. Los préstamos que ya existen quedan con seguro fijo, como antes.
 */
export class LoanInsuranceRate1794800000000 implements MigrationInterface {
  name = 'LoanInsuranceRate1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan" ADD "insurance_rate" numeric(9,6)`);
    await queryRunner.query(
      `ALTER TABLE "loan" ADD CONSTRAINT "CHK_885005eff920095325d7d4c528" CHECK (NOT ("insurance_cents" > 0 AND "insurance_rate" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan" DROP CONSTRAINT "CHK_885005eff920095325d7d4c528"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP COLUMN "insurance_rate"`);
  }
}
