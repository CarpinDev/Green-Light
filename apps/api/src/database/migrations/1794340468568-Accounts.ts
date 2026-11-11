import { MigrationInterface, QueryRunner } from 'typeorm';

export class Accounts1794340468568 implements MigrationInterface {
  name = 'Accounts1794340468568';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."account_type" AS ENUM('savings', 'checking')`);
    await queryRunner.query(
      `CREATE TABLE "account" ("product_id" integer NOT NULL, "account_type" "public"."account_type" NOT NULL, CONSTRAINT "PK_abe88b016715eaf50fdfa053dac" PRIMARY KEY ("product_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "loan" ("product_id" integer NOT NULL, "principal_cents" bigint NOT NULL, "term_months" smallint NOT NULL, "first_payment_date" date NOT NULL, "fixed_payment_cents" bigint, "insurance_cents" bigint NOT NULL DEFAULT '0', "method" "public"."amortization_method" NOT NULL DEFAULT 'fixed_installment', CONSTRAINT "CHK_73fbd1d760e05f16e1b89364e9" CHECK ("insurance_cents" >= 0), CONSTRAINT "CHK_f25338b6bbbabc8f3d34dcab7e" CHECK ("fixed_payment_cents" IS NULL OR "fixed_payment_cents" > 0), CONSTRAINT "CHK_3728e03611cbcc781ff53bfd8e" CHECK ("term_months" >= 1), CONSTRAINT "CHK_12135b92cafccdb7139daabaa3" CHECK ("principal_cents" > 0), CONSTRAINT "PK_620f430f4bf9e702c7193d73026" PRIMARY KEY ("product_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "account_balance" ("id" SERIAL NOT NULL, "product_id" integer NOT NULL, "as_of" date NOT NULL, "balance_cents" bigint NOT NULL, CONSTRAINT "UQ_31b126ae7fc653bbccef9714cec" UNIQUE ("product_id", "as_of"), CONSTRAINT "PK_bd893045760f719e24a95a42562" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "account" ADD CONSTRAINT "FK_abe88b016715eaf50fdfa053dac" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loan" ADD CONSTRAINT "FK_620f430f4bf9e702c7193d73026" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_balance" ADD CONSTRAINT "FK_52465baab895f6af293a68cd1dd" FOREIGN KEY ("product_id") REFERENCES "account"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account_balance" DROP CONSTRAINT "FK_52465baab895f6af293a68cd1dd"`);
    await queryRunner.query(`ALTER TABLE "loan" DROP CONSTRAINT "FK_620f430f4bf9e702c7193d73026"`);
    await queryRunner.query(`ALTER TABLE "account" DROP CONSTRAINT "FK_abe88b016715eaf50fdfa053dac"`);
    await queryRunner.query(`DROP TABLE "account_balance"`);
    await queryRunner.query(`DROP TABLE "loan"`);
    await queryRunner.query(`DROP TABLE "account"`);
    await queryRunner.query(`DROP TYPE "public"."account_type"`);
  }
}
