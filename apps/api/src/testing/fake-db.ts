import { DataSource, EntityManager, QueryFailedError } from 'typeorm';

// Un DataSource falso para probar los services sin Postgres. Guarda en memoria y respeta lo que
// importa de una transacción: si algo lanza, no queda nada escrito. Solo para pruebas.

type Row = Record<string, unknown>;
type Table = Map<Function, Row[]>;

export class FakeDb {
  tables: Table = new Map();
  /** Lanza al guardar esta entidad (simula una caída de la base). */
  failOn?: Function;
  /** Restricciones únicas por entidad: guardar un duplicado falla con el código 23505 de Postgres. */
  unique = new Map<Function, string[][]>();
  /** Entidades cuya llave es su propio productId: no reciben un id autogenerado. */
  withoutId = new Set<Function>();
  private nextId = 1;

  seed<T extends object>(Entity: new () => T, rows: Partial<T>[]): void {
    this.tables.set(Entity, rows.map((r) => Object.assign(new Entity(), r) as unknown as Row));
  }

  rows<T>(Entity: new () => T): T[] {
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
        save: async (data: Row) => this.insert(this.tables, Object.assign(new Entity(), data) as Row),
      }),
    } as unknown as DataSource;
  }

  private manager(staged: Table): EntityManager {
    const save = async (a: unknown, b?: Row) => {
      const entity = (typeof a === 'function' ? Object.assign(new (a as new () => object)(), b) : a) as Row;
      return this.insert(staged, entity);
    };
    const create = (Entity: new () => object, data: Row) => Object.assign(new Entity(), data);
    return { save, create } as unknown as EntityManager;
  }

  private find(tables: Table, Entity: Function, where: Row): Row | null {
    const matches = (r: Row) => Object.entries(where).every(([k, v]) => r[k] === v);
    return (tables.get(Entity) ?? []).find(matches) ?? null;
  }

  private insert(tables: Table, entity: Row): Row {
    const type = entity.constructor;
    if (type === this.failOn) throw new Error('la base se cayó');

    const list = tables.get(type) ?? [];
    for (const keys of this.unique.get(type) ?? []) {
      if (list.some((r) => keys.every((k) => r[k] === entity[k]))) {
        throw new QueryFailedError(
          `INSERT INTO "${type.name}" ...`,
          [],
          Object.assign(new Error('duplicate key value'), { code: '23505' }),
        );
      }
    }
    if (!this.withoutId.has(type) && entity.id === undefined) entity.id = this.nextId++;
    tables.set(type, [...list, entity]);
    return entity;
  }
}
