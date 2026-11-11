import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1794339744941 implements MigrationInterface {
  name = 'Init1794339744941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."product_kind" AS ENUM('credit_card', 'loan', 'account')`);
    await queryRunner.query(
      `CREATE TABLE "product" ("id" SERIAL NOT NULL, "kind" "public"."product_kind" NOT NULL, "name" character varying NOT NULL, "bank" character varying NOT NULL, "last4" character varying(4) NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8ff5dfe45fc64ddf83bb64140c8" UNIQUE ("kind", "bank", "last4"), CONSTRAINT "CHK_23eaada521a32c18e97f016366" CHECK ("last4" ~ '^[0-9]{4}$'), CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."rate_source" AS ENUM('ea', 'mv', 'both')`);
    await queryRunner.query(
      `CREATE TABLE "product_rate" ("id" SERIAL NOT NULL, "product_id" integer NOT NULL, "effective_from" date NOT NULL, "ea" numeric(14,12) NOT NULL, "mv" numeric(14,12) NOT NULL, "source" "public"."rate_source" NOT NULL, CONSTRAINT "UQ_5bc687c71ffd5ef8a34cbbeb4b0" UNIQUE ("product_id", "effective_from"), CONSTRAINT "CHK_240b80dd6a0db0762ef622b92f" CHECK ("ea" >= 0 AND "mv" >= 0), CONSTRAINT "PK_d9d0e3ca7d2c9a409963fa66a61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."amortization_method" AS ENUM('constant_capital', 'fixed_installment')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."first_period_interest" AS ENUM('prorated', 'full_month', 'none')`);
    await queryRunner.query(
      `CREATE TABLE "credit_card" ("product_id" integer NOT NULL, "credit_limit_cents" bigint NOT NULL, "cut_day" smallint NOT NULL, "due_day" smallint NOT NULL, "handling_fee_cents" bigint NOT NULL DEFAULT '0', "insurance_cents" bigint NOT NULL DEFAULT '0', "min_payment_method" "public"."amortization_method" NOT NULL DEFAULT 'constant_capital', "single_installment_interest_free" boolean NOT NULL DEFAULT true, "first_period_interest" "public"."first_period_interest" NOT NULL DEFAULT 'prorated', CONSTRAINT "CHK_fad7e4a5b79d096ab5914a60f6" CHECK ("handling_fee_cents" >= 0 AND "insurance_cents" >= 0), CONSTRAINT "CHK_766d3db11ddbe89062c837a947" CHECK ("due_day" BETWEEN 1 AND 31), CONSTRAINT "CHK_a669c9dd15c6441624d25835e8" CHECK ("cut_day" BETWEEN 1 AND 31), CONSTRAINT "CHK_59237e9dbb04302009e2d53d8e" CHECK ("credit_limit_cents" > 0), CONSTRAINT "PK_70cb1a637b83c06f638f8fa7883" PRIMARY KEY ("product_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_rate" ADD CONSTRAINT "FK_0530cbec1049082334a5df5a342" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_card" ADD CONSTRAINT "FK_70cb1a637b83c06f638f8fa7883" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit_card" DROP CONSTRAINT "FK_70cb1a637b83c06f638f8fa7883"`);
    await queryRunner.query(`ALTER TABLE "product_rate" DROP CONSTRAINT "FK_0530cbec1049082334a5df5a342"`);
    await queryRunner.query(`DROP TABLE "credit_card"`);
    await queryRunner.query(`DROP TYPE "public"."first_period_interest"`);
    await queryRunner.query(`DROP TYPE "public"."amortization_method"`);
    await queryRunner.query(`DROP TABLE "product_rate"`);
    await queryRunner.query(`DROP TYPE "public"."rate_source"`);
    await queryRunner.query(`DROP TABLE "product"`);
    await queryRunner.query(`DROP TYPE "public"."product_kind"`);
  }
}
