import { MigrationInterface, QueryRunner } from "typeorm";

export class Planning1794341573235 implements MigrationInterface {
    name = 'Planning1794341573235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "settings" ("id" smallint NOT NULL DEFAULT '1', "yellow_below_income_pct" numeric(5,4) NOT NULL DEFAULT 0.10, "card_utilization_pct" numeric(5,4) NOT NULL DEFAULT 0.30, "debt_to_income_pct" numeric(5,4) NOT NULL DEFAULT 0.30, "statement_tolerance_pct" numeric(5,4) NOT NULL DEFAULT 0.02, CONSTRAINT "CHK_056dcc7169a8869f16f83a409f" CHECK ("yellow_below_income_pct" BETWEEN 0 AND 1 AND "card_utilization_pct" BETWEEN 0 AND 1 AND "debt_to_income_pct" BETWEEN 0 AND 1 AND "statement_tolerance_pct" BETWEEN 0 AND 1), CONSTRAINT "CHK_9545e98bb13fe61a52eb4753bd" CHECK ("id" = 1), CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "statement_check" ("id" SERIAL NOT NULL, "product_id" integer NOT NULL, "cut_date" date NOT NULL, "due_date" date NOT NULL, "statement_minimum_cents" bigint NOT NULL, "statement_total_cents" bigint, "calculated_minimum_cents" bigint NOT NULL, "within_tolerance" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_86aa74d89ffee5c4380b1cab724" UNIQUE ("product_id", "cut_date"), CONSTRAINT "CHK_2ee65b00be391bf274a480b7fd" CHECK ("statement_minimum_cents" >= 0 AND "calculated_minimum_cents" >= 0), CONSTRAINT "CHK_5055589fdbe153b1b547ab98b5" CHECK ("due_date" > "cut_date"), CONSTRAINT "PK_eccc26e0f7a74f39060c1b44088" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "recurring_income" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "amount_cents" bigint NOT NULL, "day_of_month" smallint NOT NULL, "start_date" date NOT NULL, "end_date" date, "destination_account_id" integer, CONSTRAINT "CHK_abe7f170a7abe485b35ca39ac3" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "CHK_fe2b62f0ab02eeb33bd3703b41" CHECK ("day_of_month" BETWEEN 1 AND 31), CONSTRAINT "CHK_fa4a48ee37530c9d01b5b9e59b" CHECK ("amount_cents" > 0), CONSTRAINT "PK_a61fffba1c4e85548b7fe42314a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "one_off_income" ("id" SERIAL NOT NULL, "date" date NOT NULL, "amount_cents" bigint NOT NULL, "description" character varying NOT NULL DEFAULT '', "category_id" integer, "destination_account_id" integer, CONSTRAINT "CHK_84d12a82753bcabfd8e486dd8c" CHECK ("amount_cents" > 0), CONSTRAINT "PK_9f84ce475abe5d1b0184e172930" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "fixed_expense" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "amount_cents" bigint NOT NULL, "day_of_month" smallint NOT NULL, "category_id" integer, "start_date" date NOT NULL, "end_date" date, "card_id" integer, CONSTRAINT "CHK_739d072e84b62d5060edf81724" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "CHK_9744a16787b144fe62ace13e14" CHECK ("day_of_month" BETWEEN 1 AND 31), CONSTRAINT "CHK_2ebff344facbd95627386294c7" CHECK ("amount_cents" > 0), CONSTRAINT "PK_78e196f19551e2a5d33240ad006" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "statement_check" ADD CONSTRAINT "FK_11d43a2e82b6bcda72e96c2a5c2" FOREIGN KEY ("product_id") REFERENCES "credit_card"("product_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_income" ADD CONSTRAINT "FK_9934245bd86d7fd51b6cdf63195" FOREIGN KEY ("destination_account_id") REFERENCES "account"("product_id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "one_off_income" ADD CONSTRAINT "FK_ec7b54c68ff33f32316472c82df" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "one_off_income" ADD CONSTRAINT "FK_4031ce63cefa76f7e99c6f51c4c" FOREIGN KEY ("destination_account_id") REFERENCES "account"("product_id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fixed_expense" ADD CONSTRAINT "FK_7854a2cc680e3044f754d290afc" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fixed_expense" ADD CONSTRAINT "FK_190105f9f9bd86ededa3c858300" FOREIGN KEY ("card_id") REFERENCES "credit_card"("product_id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        // La única fila de settings; los defaults llenan los umbrales
        await queryRunner.query(`INSERT INTO "settings" ("id") VALUES (1)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fixed_expense" DROP CONSTRAINT "FK_190105f9f9bd86ededa3c858300"`);
        await queryRunner.query(`ALTER TABLE "fixed_expense" DROP CONSTRAINT "FK_7854a2cc680e3044f754d290afc"`);
        await queryRunner.query(`ALTER TABLE "one_off_income" DROP CONSTRAINT "FK_4031ce63cefa76f7e99c6f51c4c"`);
        await queryRunner.query(`ALTER TABLE "one_off_income" DROP CONSTRAINT "FK_ec7b54c68ff33f32316472c82df"`);
        await queryRunner.query(`ALTER TABLE "recurring_income" DROP CONSTRAINT "FK_9934245bd86d7fd51b6cdf63195"`);
        await queryRunner.query(`ALTER TABLE "statement_check" DROP CONSTRAINT "FK_11d43a2e82b6bcda72e96c2a5c2"`);
        await queryRunner.query(`DROP TABLE "fixed_expense"`);
        await queryRunner.query(`DROP TABLE "one_off_income"`);
        await queryRunner.query(`DROP TABLE "recurring_income"`);
        await queryRunner.query(`DROP TABLE "statement_check"`);
        await queryRunner.query(`DROP TABLE "settings"`);
    }

}
