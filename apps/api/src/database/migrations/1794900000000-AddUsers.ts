import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pasa la app de un solo usuario a varios: crea app_user, le pone dueño (user_id) a cada tabla con datos propios y
 * convierte settings en una fila por usuario. Todo lo que ya existe queda asignado a la dueña, que se crea con
 * OWNER_EMAIL, OWNER_NAME y OWNER_PASSWORD_HASH leídos del entorno (la contraseña NO está en el código ni en git).
 *
 * El orden importa, y por eso el NOT NULL va al final:
 *   1. user_id nace nullable: una columna NOT NULL sin default no se puede agregar a una tabla con filas.
 *   2. Se crea a la dueña y un UPDATE llena user_id en todas las filas que ya había.
 *   3. Solo cuando ninguna fila tiene user_id vacío se pone NOT NULL, y recién entonces las FK y los índices.
 * Con el NOT NULL antes del UPDATE, la migración fallaría justo con tus datos reales.
 *
 * Corre dentro de una transacción (la de TypeORM): si algo falla, la base queda exactamente como estaba.
 */
export class AddUsers1794900000000 implements MigrationInterface {
  name = 'AddUsers1794900000000';

  /** Las tablas con datos propios que ganan user_id. No incluye settings (su llave pasa a ser user_id). */
  private static readonly OWNED = [
    'product',
    'product_rate',
    'statement_check',
    'category',
    'expense',
    'account_balance',
    'capital_payment',
    'one_off_income',
    'fixed_expense',
    'recurring_income',
  ] as const;

  /** Nombres que TypeORM espera (salen de migration:generate): así el esquema coincide con las entidades. */
  private static readonly INDEXES: Record<string, { name: string; columns: string }> = {
    product: { name: 'IDX_3e59a34134d840e83c2010fac9', columns: '"user_id"' },
    product_rate: { name: 'IDX_624515657d9e4ed22db497405f', columns: '"user_id"' },
    statement_check: { name: 'IDX_88399e0616e99c5f945917d90f', columns: '"user_id"' },
    category: { name: 'IDX_6562e564389d0600e6e243d960', columns: '"user_id"' },
    expense: { name: 'IDX_26738f81c5da74e2ce9ddb2af4', columns: '"user_id", "date"' },
    account_balance: { name: 'IDX_9bcfddeb2e626021c04ba5a245', columns: '"user_id"' },
    capital_payment: { name: 'IDX_7e2b53d498113fe06e87bf653e', columns: '"user_id", "date"' },
    one_off_income: { name: 'IDX_987db9453c4297331b56834cda', columns: '"user_id", "date"' },
    fixed_expense: { name: 'IDX_fba17f8191c9f6282c0960253f', columns: '"user_id"' },
    recurring_income: { name: 'IDX_e4428cb592ae36712ee4567f30', columns: '"user_id"' },
  };

  private static readonly FOREIGN_KEYS: Record<string, string> = {
    settings: 'FK_a2883eaa72b3b2e8c98e7446098',
    product: 'FK_3e59a34134d840e83c2010fac9a',
    product_rate: 'FK_624515657d9e4ed22db497405f3',
    statement_check: 'FK_88399e0616e99c5f945917d90fd',
    category: 'FK_6562e564389d0600e6e243d9604',
    expense: 'FK_8aed1abe692b31639ccde1b0416',
    account_balance: 'FK_9bcfddeb2e626021c04ba5a245c',
    capital_payment: 'FK_9284f3208b3aaa4157353b5fa6b',
    one_off_income: 'FK_45215361652ff9d7206dc8aa147',
    fixed_expense: 'FK_fba17f8191c9f6282c0960253ff',
    recurring_income: 'FK_e4428cb592ae36712ee4567f30d',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    const { OWNED } = AddUsers1794900000000;

    // Antes de cambiar nada: ¿hay datos? Si los hay, hace falta una dueña, y se avisa ya, con un mensaje claro.
    let rows = 0;
    for (const table of OWNED) {
      const [{ n }] = (await queryRunner.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)) as { n: number }[];
      rows += n;
    }
    const owner = rows > 0 ? readOwner(rows) : null;

    // 1. La tabla de usuarios
    await queryRunner.query(
      `CREATE TABLE "app_user" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "name" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3fa909d0e37c531ebc237703391" UNIQUE ("email"), CONSTRAINT "PK_22a5c4a3d9b2fb8e4e73fc4ada1" PRIMARY KEY ("id"))`,
    );

    // 2. user_id nullable en cada tabla
    for (const table of OWNED) await queryRunner.query(`ALTER TABLE "${table}" ADD "user_id" integer`);
    await queryRunner.query(`ALTER TABLE "settings" ADD "user_id" integer`);

    // 3. La dueña y la asignación de todo lo existente
    if (owner) {
      const [{ id }] = (await queryRunner.query(
        `INSERT INTO "app_user" ("email", "password_hash", "name") VALUES ($1, $2, $3) RETURNING "id"`,
        [owner.email, owner.passwordHash, owner.name],
      )) as { id: number }[];
      for (const table of [...OWNED, 'settings']) {
        await queryRunner.query(`UPDATE "${table}" SET "user_id" = $1`, [id]);
      }
    } else {
      // Base vacía: nadie es dueño de nada. La fila de ajustes por defecto que dejó la migración Planning se borra:
      // cada usuario recibe la suya al registrarse.
      await queryRunner.query(`DELETE FROM "settings"`);
    }

    // 4. settings: de la fila única (id = 1) a una por usuario, con user_id como llave
    await queryRunner.query(`ALTER TABLE "settings" DROP CONSTRAINT "CHK_9545e98bb13fe61a52eb4753bd"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP CONSTRAINT "PK_0669fe20e252eb692bf4d344975"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "id"`);

    // 5. Ya no queda ninguna fila sin dueño: ahora sí NOT NULL, llaves, FK, índices y uniques
    for (const table of OWNED) await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "settings" ADD CONSTRAINT "PK_a2883eaa72b3b2e8c98e7446098" PRIMARY KEY ("user_id")`,
    );

    // El nombre de un producto y de una categoría solo es único dentro de cada persona
    await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "UQ_8ff5dfe45fc64ddf83bb64140c8"`);
    await queryRunner.query(`ALTER TABLE "category" DROP CONSTRAINT "UQ_c81af81aecb62c61401c586afb1"`);
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "UQ_1d065e31e0035bcbdbf7100026a" UNIQUE ("user_id", "kind", "bank", "last4")`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD CONSTRAINT "UQ_3b818b00bf7129a3a0a1ad39762" UNIQUE ("user_id", "name", "kind")`,
    );

    // El índice por fecha de expense pasa a ser (user_id, date): toda consulta filtra por usuario primero
    await queryRunner.query(`DROP INDEX "public"."IDX_74afce11886f545980dde124d5"`);
    for (const table of OWNED) {
      const { name, columns } = AddUsers1794900000000.INDEXES[table];
      await queryRunner.query(`CREATE INDEX "${name}" ON "${table}" (${columns})`);
    }

    for (const [table, fk] of Object.entries(AddUsers1794900000000.FOREIGN_KEYS)) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${fk}" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }

  /**
   * Vuelve al esquema de un solo usuario. Solo se puede con un usuario o ninguno: con varios, quitar user_id
   * mezclaría los datos de todos en una sola cuenta, así que se rechaza en vez de hacerlo en silencio.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const { OWNED } = AddUsers1794900000000;
    const [{ n }] = (await queryRunner.query(`SELECT COUNT(*)::int AS n FROM "app_user"`)) as { n: number }[];
    if (n > 1) {
      throw new Error(
        `No se puede revertir AddUsers con ${n} usuarios: los datos de todos quedarían mezclados. Deja un solo usuario antes.`,
      );
    }

    for (const table of Object.keys(AddUsers1794900000000.FOREIGN_KEYS)) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${AddUsers1794900000000.FOREIGN_KEYS[table]}"`);
    }
    for (const table of OWNED) {
      await queryRunner.query(`DROP INDEX "public"."${AddUsers1794900000000.INDEXES[table].name}"`);
    }
    await queryRunner.query(`CREATE INDEX "IDX_74afce11886f545980dde124d5" ON "expense" ("date") `);

    await queryRunner.query(`ALTER TABLE "category" DROP CONSTRAINT "UQ_3b818b00bf7129a3a0a1ad39762"`);
    await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT "UQ_1d065e31e0035bcbdbf7100026a"`);
    await queryRunner.query(
      `ALTER TABLE "category" ADD CONSTRAINT "UQ_c81af81aecb62c61401c586afb1" UNIQUE ("kind", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "UQ_8ff5dfe45fc64ddf83bb64140c8" UNIQUE ("bank", "kind", "last4")`,
    );

    // settings: otra vez la fila única con id = 1 (si no había usuarios, no había fila: se vuelve a crear con los defaults)
    await queryRunner.query(`ALTER TABLE "settings" DROP CONSTRAINT "PK_a2883eaa72b3b2e8c98e7446098"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "settings" ADD "id" smallint NOT NULL DEFAULT '1'`);
    await queryRunner.query(
      `ALTER TABLE "settings" ADD CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(`ALTER TABLE "settings" ADD CONSTRAINT "CHK_9545e98bb13fe61a52eb4753bd" CHECK ((id = 1))`);
    await queryRunner.query(`INSERT INTO "settings" ("id") VALUES (1) ON CONFLICT DO NOTHING`);

    for (const table of OWNED) await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "user_id"`);
    await queryRunner.query(`DROP TABLE "app_user"`);
  }
}

/** La dueña de los datos que ya existen, de OWNER_EMAIL, OWNER_NAME y OWNER_PASSWORD_HASH. Falla con un mensaje claro. */
function readOwner(rows: number): { email: string; name: string; passwordHash: string } {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.OWNER_NAME?.trim();
  const passwordHash = process.env.OWNER_PASSWORD_HASH?.trim();

  const missing = [!email && 'OWNER_EMAIL', !name && 'OWNER_NAME', !passwordHash && 'OWNER_PASSWORD_HASH'].filter(
    (v): v is string => typeof v === 'string',
  );
  if (missing.length > 0) {
    throw new Error(
      `La base ya tiene datos (${rows} filas) y la migración AddUsers necesita saber de quién son. ` +
        `Falta en el entorno: ${missing.join(', ')}. No se cambió nada. ` +
        `Genera el hash con "npm run hash-password -w @greenlight/api".`,
    );
  }
  // Un hash argon2 empieza por "$argon2": si dotenv se comió los "$" (variable expandida) queda otra cosa
  if (!passwordHash!.startsWith('$argon2id$')) {
    throw new Error(
      'OWNER_PASSWORD_HASH no parece un hash argon2id (debe empezar por "$argon2id$"). ' +
        'Si lo copiaste a mano, revisa que no se perdieran los "$" (en .env va entre comillas simples). No se cambió nada.',
    );
  }
  return { email: email!, name: name!, passwordHash: passwordHash! };
}
