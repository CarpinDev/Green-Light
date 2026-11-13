import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../common/pg-errors';
import { Settings } from '../settings/entities/settings.entity';
import { User } from './entities/user.entity';

/** El email se guarda y se busca siempre en minúsculas y sin espacios: Ana@Mail.com y ana@mail.com son la misma persona. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lo que se puede mostrar de un usuario: nunca el hash. */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
}

export function toPublicUser({ id, email, name }: User): PublicUser {
  return { id, email, name };
}

@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  findByEmail(email: string): Promise<User | null> {
    return this.dataSource.getRepository(User).findOneBy({ email: normalizeEmail(email) });
  }

  findById(id: number): Promise<User | null> {
    return this.dataSource.getRepository(User).findOneBy({ id });
  }

  /**
   * Crea el usuario y su fila de ajustes (con los umbrales por defecto) en una sola transacción: no puede quedar
   * un usuario sin ajustes. 409 si el email ya existe, sin importar cómo lo escriba.
   */
  async create(input: { email: string; name: string; passwordHash: string }): Promise<User> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.save(User, {
          email: normalizeEmail(input.email),
          name: input.name.trim(),
          passwordHash: input.passwordHash,
        });
        await manager.save(Settings, { userId: user.id });
        return user;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya existe una cuenta con ese email');
      throw err;
    }
  }
}
