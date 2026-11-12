import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `replaced_by_id`: qué registro reemplazó a este por un cambio de monto. Un registro reemplazado no se puede
 * reactivar (se superpondría con su sucesor y la proyección contaría dos veces); uno terminado a mano, sí.
 *
 * SET NULL: si se borra el sucesor, el registro viejo vuelve a ser reactivable (conserva su fecha de fin).
 *
 * El backfill marca los cambios de monto que ya existen con la misma huella que dejan: B tiene el mismo nombre y
 * el mismo destino u origen que A, y empieza el día siguiente al fin de A. Si un caso raro no cuadra queda sin
 * marcar y se podría reactivar; si uno terminado a mano coincide por casualidad con otro de su nombre, queda
 * marcado y no se reactiva (se edita el vigente). Ninguno de los dos corrompe datos.
 */
export class ReplacedBy1794700000000 implements MigrationInterface {
  name = 'ReplacedBy1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "recurring_income" ADD "replaced_by_id" integer`);
    await queryRunner.query(`ALTER TABLE "fixed_expense" ADD "replaced_by_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "recurring_income" ADD CONSTRAINT "FK_9f8bfce003911e6a9a7b4ecc022" FOREIGN KEY ("replaced_by_id") REFERENCES "recurring_income"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fixed_expense" ADD CONSTRAINT "FK_c556d3336ff57ddd2c136c5d531" FOREIGN KEY ("replaced_by_id") REFERENCES "fixed_expense"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      UPDATE "recurring_income" a SET "replaced_by_id" = (
        SELECT b."id" FROM "recurring_income" b
        WHERE b."id" <> a."id" AND b."name" = a."name"
          AND b."destination_account_id" IS NOT DISTINCT FROM a."destination_account_id"
          AND b."start_date" = a."end_date" + 1
        ORDER BY b."id" LIMIT 1)
      WHERE a."end_date" IS NOT NULL`);
    await queryRunner.query(`
      UPDATE "fixed_expense" a SET "replaced_by_id" = (
        SELECT b."id" FROM "fixed_expense" b
        WHERE b."id" <> a."id" AND b."name" = a."name"
          AND b."card_id" IS NOT DISTINCT FROM a."card_id"
          AND b."account_id" IS NOT DISTINCT FROM a."account_id"
          AND b."start_date" = a."end_date" + 1
        ORDER BY b."id" LIMIT 1)
      WHERE a."end_date" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fixed_expense" DROP CONSTRAINT "FK_c556d3336ff57ddd2c136c5d531"`);
    await queryRunner.query(`ALTER TABLE "recurring_income" DROP CONSTRAINT "FK_9f8bfce003911e6a9a7b4ecc022"`);
    await queryRunner.query(`ALTER TABLE "fixed_expense" DROP COLUMN "replaced_by_id"`);
    await queryRunner.query(`ALTER TABLE "recurring_income" DROP COLUMN "replaced_by_id"`);
  }
}
