import { DataSource, EntityManager, FindOperator, QueryFailedError, getMetadataArgsStorage } from 'typeorm';
import { USER } from './users';

// Un DataSource falso para probar los services sin Postgres. Guarda en memoria y respeta lo que
// importa de una transacción: si algo lanza, no queda nada escrito. Solo para pruebas.

type Row = Record<string, unknown>;
export type EntityClass = new () => object;
type Table = Map<EntityClass, Row[]>;
interface FindOptions {
  where?: Row;
  order?: Record<string, 'ASC' | 'DESC'>;
  /** Como find({ take }): solo las primeras N, después de ordenar. */
  take?: number;
}

export class FakeDb {
  tables: Table = new Map();
  /** Lanza al guardar esta entidad (simula una caída de la base). */
  failOn?: EntityClass;
  /** Restricciones únicas por entidad: guardar un duplicado falla con el código 23505 de Postgres. */
  unique = new Map<EntityClass, string[][]>();
  /** Entidades cuya llave es su propio productId: no reciben un id autogenerado. */
  withoutId = new Set<EntityClass>();
  /** Entidades cuya llave no es id ni productId (settings: userId). Tampoco reciben un id autogenerado. */
  keyBy = new Map<EntityClass, string>();
  private nextId = 1;

  /**
   * Siembra filas. Si la entidad tiene dueño (columna userId) y la fila no dice de quién es, es de USER:
   * así las pruebas de un solo usuario no repiten el dueño en cada fila.
   */
  seed<T extends object>(Entity: new () => T, rows: readonly Partial<T>[]): void {
    const owned = hasUserColumn(Entity);
    this.tables.set(
      Entity,
      rows.map((r) => {
        const row = Object.assign(new Entity(), r) as unknown as Row;
        // `=== undefined` y no `in`: una entidad ya armada trae userId como propiedad vacía
        if (owned && row.userId === undefined) row.userId = USER;
        return row;
      }),
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
        findOneByOrFail: async (where: Row) => {
          const found = this.find(this.tables, Entity, where);
          if (!found) throw new Error(`no hay ${Entity.name} con ${JSON.stringify(where)}`);
          return found;
        },
        find: async (options: FindOptions = {}) =>
          this.findAll(this.tables, Entity, options.where ?? {}, options.order, options.take),
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
    const del = async (Entity: EntityClass, where: Row) => this.remove(staged, Entity, where);
    const find = async (Entity: EntityClass, options: FindOptions = {}) =>
      this.findAll(staged, Entity, options.where ?? {}, options.order, options.take);
    return { save, create, findOneBy, delete: del, find } as unknown as EntityManager;
  }

  private findAll(
    tables: Table,
    Entity: EntityClass,
    where: Row,
    order: FindOptions['order'] = {},
    take?: number,
  ): Row[] {
    // Igualdad, y LessThanOrEqual(x) para los rangos de fecha
    const matches = (r: Row) =>
      Object.entries(where).every(([k, v]) => {
        if (v instanceof FindOperator && v.type === 'lessThanOrEqual') return String(r[k]) <= String(v.value);
        return r[k] === v;
      });
    const found = (tables.get(Entity) ?? []).filter(matches);
    // Como find({ order }): por cada columna, en el orden en que se pidieron
    const sorted = found.sort((a, b) => {
      for (const [column, direction] of Object.entries(order)) {
        const x = a[column];
        const y = b[column];
        // Las horas (Date) se comparan como números; el resto, como texto
        const cmp =
          x instanceof Date && y instanceof Date
            ? x.getTime() - y.getTime()
            : String(x).localeCompare(String(y), 'es', { numeric: true });
        if (cmp !== 0) return direction === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
    return take === undefined ? sorted : sorted.slice(0, take);
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
    const key = this.keyBy.get(type) ?? (this.withoutId.has(type) ? 'productId' : 'id');
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
    if (!this.withoutId.has(type) && !this.keyBy.has(type) && entity.id === undefined) {
      // Los ids que se sembraron a mano no se pisan: el siguiente es mayor que todos los de la tabla
      const highest = Math.max(0, ...list.map((r) => Number(r.id ?? 0)));
      entity.id = Math.max(this.nextId++, highest + 1);
    }
    tables.set(type, [...list, entity]);
    return entity;
  }
}

/** ¿La entidad tiene una columna userId? Se lee de los metadatos de TypeORM, no de la instancia. */
function hasUserColumn(Entity: EntityClass): boolean {
  return getMetadataArgsStorage().columns.some((c) => c.target === Entity && c.propertyName === 'userId');
}
