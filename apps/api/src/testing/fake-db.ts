import { DataSource, EntityManager, QueryFailedError } from 'typeorm';

// Un DataSource falso para probar los services sin Postgres. Guarda en memoria y respeta lo que
// importa de una transacción: si algo lanza, no queda nada escrito. Solo para pruebas.

type Row = Record<string, unknown>;
export type EntityClass = new () => object;
type Table = Map<EntityClass, Row[]>;
interface FindOptions {
  where?: Row;
  order?: Record<string, 'ASC' | 'DESC'>;
}

export class FakeDb {
  tables: Table = new Map();
  /** Lanza al guardar esta entidad (simula una caída de la base). */
  failOn?: EntityClass;
  /** Restricciones únicas por entidad: guardar un duplicado falla con el código 23505 de Postgres. */
  unique = new Map<EntityClass, string[][]>();
  /** Entidades cuya llave es su propio productId: no reciben un id autogenerado. */
  withoutId = new Set<EntityClass>();
  private nextId = 1;

  seed<T extends object>(Entity: new () => T, rows: readonly Partial<T>[]): void {
    this.tables.set(
      Entity,
      rows.map((r) => Object.assign(new Entity(), r) as unknown as Row),
    );
  }

  rows<T extends object>(Entity: new () => T): T[] {
    return (this.tables.get(Entity) ?? []) as unknown as T[];
  }

  dataSource(): DataSource {
    return {
      transaction: async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> => {
        const staged: Table = new Map();
        for (const [k, v] of this.tables) staged.set(k, [...v]);
        const result = await work(this.manager(staged));
        this.tables = staged; // commit solo si work no lanzó
        return result;
      },
      getRepository: (Entity: new () => object) => ({
        findOneBy: async (where: Row) => this.find(this.tables, Entity, where),
        find: async (options: FindOptions = {}) =>
          this.findAll(this.tables, Entity, options.where ?? {}, options.order),
        save: async (data: Row) => this.insert(this.tables, Object.assign(new Entity(), data)),
        delete: async (where: Row) => this.remove(this.tables, Entity, where),
      }),
    } as unknown as DataSource;
  }

  private manager(staged: Table): EntityManager {
    const save = async (a: unknown, b?: Row) => {
      const entity = (typeof a === 'function' ? Object.assign(new (a as new () => object)(), b) : a) as Row;
      return this.insert(staged, entity);
    };
    const create = (Entity: new () => object, data: Row) => Object.assign(new Entity(), data);
    const findOneBy = async (Entity: EntityClass, where: Row) => this.find(staged, Entity, where);
    return { save, create, findOneBy } as unknown as EntityManager;
  }

  private findAll(tables: Table, Entity: EntityClass, where: Row, order: FindOptions['order'] = {}): Row[] {
    const matches = (r: Row) => Object.entries(where).every(([k, v]) => r[k] === v);
    const found = (tables.get(Entity) ?? []).filter(matches);
    // Como find({ order }): por cada columna, en el orden en que se pidieron
    return found.sort((a, b) => {
      for (const [column, direction] of Object.entries(order)) {
        const x = String(a[column]);
        const y = String(b[column]);
        const cmp = x.localeCompare(y, 'es', { numeric: true });
        if (cmp !== 0) return direction === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  /** Como repository.delete(criteria): borra lo que coincide y dice cuántas filas fueron. */
  private remove(tables: Table, Entity: EntityClass, where: Row): { affected: number } {
    const matches = (r: Row) => Object.entries(where).every(([k, v]) => r[k] === v);
    const list = tables.get(Entity) ?? [];
    tables.set(
      Entity,
      list.filter((r) => !matches(r)),
    );
    return { affected: list.filter(matches).length };
  }

  private find(tables: Table, Entity: EntityClass, where: Row): Row | null {
    return this.findAll(tables, Entity, where)[0] ?? null;
  }

  private insert(tables: Table, entity: Row): Row {
    const type = entity.constructor as EntityClass;
    if (type === this.failOn) throw new Error('la base se cayó');

    const list = tables.get(type) ?? [];

    // Como TypeORM: guardar una entidad con un id que ya existe la actualiza
    // La llave es id, o productId en las entidades que comparten la llave de product
    const key = this.withoutId.has(type) ? 'productId' : 'id';
    const existing = entity[key] === undefined ? undefined : list.find((r) => r[key] === entity[key]);
    if (existing) {
      // Como TypeORM, las propiedades undefined no pisan lo que ya está guardado
      const changes = Object.fromEntries(Object.entries(entity).filter(([, v]) => v !== undefined));
      return Object.assign(existing, changes);
    }

    for (const keys of this.unique.get(type) ?? []) {
      if (list.some((r) => keys.every((k) => r[k] === entity[k]))) {
        throw new QueryFailedError(
          `INSERT INTO "${type.name}" ...`,
          [],
          Object.assign(new Error('duplicate key value'), { code: '23505' }),
        );
      }
    }
    if (!this.withoutId.has(type) && entity.id === undefined) {
      // Los ids que se sembraron a mano no se pisan: el siguiente es mayor que todos los de la tabla
      const highest = Math.max(0, ...list.map((r) => Number(r.id ?? 0)));
      entity.id = Math.max(this.nextId++, highest + 1);
    }
    tables.set(type, [...list, entity]);
    return entity;
  }
}
