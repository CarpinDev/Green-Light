import { MigrationInterface, QueryRunner } from "typeorm";

export class Movements1794340787814 implements MigrationInterface {
    name = 'Movements1794340787814'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income')`);
        await queryRunner.query(`CREATE TABLE "category" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "kind" "public"."category_kind" NOT NULL, CONSTRAINT "UQ_c81af81aecb62c61401c586afb1" UNIQUE ("name", "kind"), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "expense" ("id" SERIAL NOT NULL, "date" date NOT NULL, "amount_cents" bigint NOT NULL, "category_id" integer, "description" character varying NOT NULL DEFAULT '', "source_product_id" integer NOT NULL, "installments" smallint, "promo_ea" numeric(14,12), "promo_mv" numeric(14,12), "promo_description" character varying NOT NULL DEFAULT '', "is_opening_debt" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_9438a3bd637af489899f5c008c" CHECK (("promo_ea" IS NULL) = ("promo_mv" IS NULL)), CONSTRAINT "CHK_cff4fc9a1f75b101c4c577ff87" CHECK ("installments" IS NULL OR "installments" BETWEEN 1 AND 72), CONSTRAINT "CHK_04a6610313df52fdb570945c6b" CHECK ("amount_cents" > 0), CONSTRAINT "PK_edd925b450e13ea36197c9590fc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_10706bc5c2454b51c5f8ddf07e" ON "expense" ("source_product_id", "date") `);
        await queryRunner.query(`CREATE INDEX "IDX_74afce11886f545980dde124d5" ON "expense" ("date") `);
        await queryRunner.query(`CREATE TYPE "public"."prepayment_mode" AS ENUM('reduce_term', 'reduce_payment')`);
        await queryRunner.query(`CREATE TABLE "capital_payment" ("id" SERIAL NOT NULL, "product_id" integer NOT NULL, "date" date NOT NULL, "amount_cents" bigint NOT NULL, "mode" "public"."prepayment_mode" NOT NULL DEFAULT 'reduce_term', "expense_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_da3cc812a6cb761b9a715ccc38" CHECK ("amount_cents" > 0), CONSTRAINT "PK_68343409939a442443243bdbc50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "expense" ADD CONSTRAINT "FK_478b68a9314d8787fb3763a2298" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense" ADD CONSTRAINT "FK_425a532e377eef279131f604ec4" FOREIGN KEY ("source_product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "capital_payment" ADD CONSTRAINT "FK_0ec54d6b3b85022d95f49518896" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "capital_payment" ADD CONSTRAINT "FK_365ee632e4881c2bca67166c766" FOREIGN KEY ("expense_id") REFERENCES "expense"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "capital_payment" DROP CONSTRAINT "FK_365ee632e4881c2bca67166c766"`);
        await queryRunner.query(`ALTER TABLE "capital_payment" DROP CONSTRAINT "FK_0ec54d6b3b85022d95f49518896"`);
        await queryRunner.query(`ALTER TABLE "expense" DROP CONSTRAINT "FK_425a532e377eef279131f604ec4"`);
        await queryRunner.query(`ALTER TABLE "expense" DROP CONSTRAINT "FK_478b68a9314d8787fb3763a2298"`);
        await queryRunner.query(`DROP TABLE "capital_payment"`);
        await queryRunner.query(`DROP TYPE "public"."prepayment_mode"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_74afce11886f545980dde124d5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_10706bc5c2454b51c5f8ddf07e"`);
        await queryRunner.query(`DROP TABLE "expense"`);
        await queryRunner.query(`DROP TABLE "category"`);
        await queryRunner.query(`DROP TYPE "public"."category_kind"`);
    }

}
