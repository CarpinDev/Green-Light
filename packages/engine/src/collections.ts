/** Suma lo que devuelve `pick` para cada elemento. */
export function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
