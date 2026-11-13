import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Una persona que usa la app. La tabla se llama app_user y no user porque `user` es palabra reservada en Postgres
 * (habría que escribirla entre comillas en cada consulta).
 */
@Entity('app_user')
export class User {
  @PrimaryGeneratedColumn() id!: number;

  /** Siempre en minúsculas (se normaliza antes de guardar y de buscar): único sin importar cómo lo escriba. */
  @Column({ unique: true }) email!: string;

  /** Hash argon2id con su sal incluida. Nunca la contraseña, y nunca sale en una respuesta. */
  @Column() passwordHash!: string;

  @Column() name!: string;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
