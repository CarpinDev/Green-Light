import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La hora de registro de los ingresos puntuales y de los saldos confirmados: con ella la proyección
 * decide si algo del mismo día del saldo se registró antes (ya está dentro) o después (cuenta).
 *
 * Las filas que ya existen quedan con la hora de esta migración. No cambia nada para los datos viejos:
 * todas toman el mismo `now()` (el de la transacción) y la comparación es estricta (`createdAt > saldo`),
 * así que un ingreso viejo del día del saldo no se cuenta, igual que antes. Se agrega primero a
 * one_off_income y de último a account_balance para que, aun en transacciones separadas, el saldo
 * nunca quede con una hora anterior a la de un ingreso viejo.
 */
export class CreatedAtForBalanceAndIncome1794400000000 implements MigrationInterface {
  name = 'CreatedAtForBalanceAndIncome1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "one_off_income" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_balance" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account_balance" DROP COLUMN "created_at"`);
    await queryRunner.query(`ALTER TABLE "one_off_income" DROP COLUMN "created_at"`);
  }
}
